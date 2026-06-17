import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CcpParserService } from './ccp-parser.service';
import { RiskScoringService } from './risk-scoring.service';
import { UtilsService } from '../common/utils.service';
import { CsvExportService } from './csv-export.service';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class CcpService {
  private readonly clientHashSalt = process.env.CLIENT_HASH_SALT || '';
  private readonly maxUploadFiles = parseInt(process.env.MAX_UPLOAD_FILES || '100');
  private readonly maxUploadSizeMb = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '50');
  private readonly maxTotalLines = parseInt(process.env.MAX_TOTAL_LINES || '250000');

  constructor(
    private prisma: PrismaService,
    private parser: CcpParserService,
    private riskScoring: RiskScoringService,
    private utils: UtilsService,
    private csvExport: CsvExportService,
  ) {}

  async previewFiles(
    files: { buffer: Buffer; filename: string }[],
  ): Promise<{
    fileCount: number;
    totalLines: number;
    invalidLines: number;
    attemptedAmount: number;
    collectedAmount: number;
    failedAmount: number;
  }> {
    this.validateFiles(files);

    let totalLines = 0;
    let invalidLines = 0;
    let attemptedAmount = 0;
    let collectedAmount = 0;
    let failedAmount = 0;

    for (const file of files) {
      const content = file.buffer.toString('utf-8');
      const parsedLines = this.parser.parseFile(content, this.clientHashSalt);

      for (const line of parsedLines) {
        totalLines++;
        if (!line.isValid) {
          invalidLines++;
        } else {
          attemptedAmount += line.amount;
          if (line.code === 0) {
            collectedAmount += line.amount;
          } else if (line.code === 1) {
            failedAmount += line.amount;
          }
        }
      }
    }

    return {
      fileCount: files.length,
      totalLines,
      invalidLines,
      attemptedAmount,
      collectedAmount,
      failedAmount,
    };
  }

  async uploadFiles(
    files: { buffer: Buffer; filename: string }[],
    showroomName: string,
    phone: string | null,
    wilaya: string | null,
    consentAccepted: boolean,
  ): Promise<{
    accessToken: string;
    sessionId: number;
  }> {
    this.validateFiles(files);

    if (!showroomName || !showroomName.trim()) {
      throw new BadRequestException('Showroom name is required');
    }

    if (!consentAccepted) {
      throw new BadRequestException('Consent must be accepted');
    }

    // Create lead
    const lead = await this.prisma.uploadLead.create({
      data: {
        showroomName,
        phone: phone || null,
        wilaya: wilaya || null,
        consentAccepted: true,
        consentAcceptedAt: new Date(),
      },
    });

    // Generate tokens
    const accessToken = this.utils.generateAccessToken();
    const accessTokenHash = this.utils.hashValue(
      accessToken,
      process.env.ACCESS_TOKEN_SECRET || '',
    );

    // Create session
    const session = await this.prisma.analysisSession.create({
      data: {
        leadId: lead.id,
        accessTokenHash,
        fileCount: files.length,
        totalLines: 0,
        invalidLines: 0,
        attemptedAmount: 0,
        collectedAmount: 0,
        failedAmount: 0,
        successCount: 0,
        failedCount: 0,
        collectionRate: 0,
        uniqueClientCount: 0,
        failedClientCount: 0,
        followUpClientCount: 0,
        riskyClientCount: 0,
        blockCandidateCount: 0,
      },
    });

    // Process each file
    let totalLines = 0;
    let invalidLines = 0;
    let attemptedAmount = 0;
    let collectedAmount = 0;
    let failedAmount = 0;
    let successCount = 0;
    let failedCount = 0;

    const clientStats = new Map<
      string,
      {
        totalAttempted: number;
        totalCollected: number;
        totalFailed: number;
        successLines: number;
        failedLines: number;
        failedRefs: Set<string>;
        failedMonths: Set<string>;
        lastFailure: Date | null;
        name: string;
        nameNorm: string;
        mask: string;
      }
    >();

    for (const file of files) {
      const sanitizedFilename = this.utils.sanitizeFilename(file.filename);
      const content = file.buffer.toString('utf-8');
      const parsedLines = this.parser.parseFile(content, this.clientHashSalt);

      const uploadedFile = await this.prisma.uploadedFile.create({
        data: {
          sessionId: session.id,
          filename: sanitizedFilename,
          originalFilename: file.filename,
          totalLines: parsedLines.length,
          invalidLines: 0,
          attemptedAmount: 0,
          collectedAmount: 0,
          failedAmount: 0,
          successCount: 0,
          failedCount: 0,
        },
      });

      let fileInvalidLines = 0;
      let fileAttemptedAmount = 0;
      let fileCollectedAmount = 0;
      let fileFailedAmount = 0;
      let fileSuccessCount = 0;
      let fileFailedCount = 0;

      const ccpLinesToCreate: any[] = [];

      for (const parsedLine of parsedLines) {
        totalLines++;

        if (!parsedLine.isValid) {
          invalidLines++;
          fileInvalidLines++;
        } else {
          const ccpLine = {
            sessionId: session.id,
            fileId: uploadedFile.id,
            clientAccountHash: parsedLine.clientAccountHash,
            clientAccountMask: parsedLine.clientAccountMask,
            clientName: parsedLine.clientName,
            clientNameNorm: parsedLine.clientNameNorm,
            amount: new Decimal(parsedLine.amount),
            operationDate: parsedLine.operationDate,
            ccpAccount: parsedLine.ccpAccount,
            code: parsedLine.code,
            delayDays: parsedLine.delayDays,
            reference: parsedLine.reference,
            cleanReference: parsedLine.cleanReference,
            rawLine: null,
          };
          ccpLinesToCreate.push(ccpLine);

          attemptedAmount += parsedLine.amount;
          fileAttemptedAmount += parsedLine.amount;

          if (parsedLine.code === 0) {
            collectedAmount += parsedLine.amount;
            fileCollectedAmount += parsedLine.amount;
            successCount++;
            fileSuccessCount++;
          } else if (parsedLine.code === 1) {
            failedAmount += parsedLine.amount;
            fileFailedAmount += parsedLine.amount;
            failedCount++;
            fileFailedCount++;
          }

          // Track client stats
          if (!clientStats.has(parsedLine.clientAccountHash)) {
            clientStats.set(parsedLine.clientAccountHash, {
              totalAttempted: 0,
              totalCollected: 0,
              totalFailed: 0,
              successLines: 0,
              failedLines: 0,
              failedRefs: new Set(),
              failedMonths: new Set(),
              lastFailure: null,
              name: parsedLine.clientName,
              nameNorm: parsedLine.clientNameNorm,
              mask: parsedLine.clientAccountMask,
            });
          }

          const stats = clientStats.get(parsedLine.clientAccountHash)!;
          stats.totalAttempted += parsedLine.amount;

          if (parsedLine.code === 0) {
            stats.totalCollected += parsedLine.amount;
            stats.successLines++;
          } else {
            stats.totalFailed += parsedLine.amount;
            stats.failedLines++;
            stats.failedRefs.add(parsedLine.cleanReference);
            const month = parsedLine.operationDate.toISOString().substring(0, 7);
            stats.failedMonths.add(month);
            if (!stats.lastFailure || parsedLine.operationDate > stats.lastFailure) {
              stats.lastFailure = parsedLine.operationDate;
            }
          }
        }
      }

      // Bulk insert CCP lines
      if (ccpLinesToCreate.length > 0) {
        await this.prisma.ccpLine.createMany({
          data: ccpLinesToCreate,
        });
      }

      // Update file stats
      await this.prisma.uploadedFile.update({
        where: { id: uploadedFile.id },
        data: {
          invalidLines: fileInvalidLines,
          attemptedAmount: new Decimal(fileAttemptedAmount),
          collectedAmount: new Decimal(fileCollectedAmount),
          failedAmount: new Decimal(fileFailedAmount),
          successCount: fileSuccessCount,
          failedCount: fileFailedCount,
        },
      });
    }

    // Calculate session statistics
    const uniqueClients = clientStats.size;

    let failedClientCount = 0;
    let followUpClientCount = 0;
    let riskyClientCount = 0;
    let blockCandidateCount = 0;

    for (const stats of clientStats.values()) {
      if (stats.totalFailed > 0) {
        followUpClientCount++;
      }

      const riskData = {
        clientAccountHash: '',
        clientAccountMask: stats.mask,
        clientName: stats.name,
        clientNameNorm: stats.nameNorm,
        totalAttemptedAmount: stats.totalAttempted,
        totalCollectedAmount: stats.totalCollected,
        totalFailedAmount: stats.totalFailed,
        successLineCount: stats.successLines,
        failedLineCount: stats.failedLines,
        uniqueFailedReferences: stats.failedRefs.size,
        failedMonthsCount: stats.failedMonths.size,
        lastFailureDate: stats.lastFailure,
      };

      if (stats.totalFailed > 0) {
        failedClientCount++;
      }

      if (this.riskScoring.classifyRisky(riskData)) {
        riskyClientCount++;
      }

      if (this.riskScoring.classifyBlockCandidate(riskData)) {
        blockCandidateCount++;
      }
    }

    const collectionRate =
      attemptedAmount > 0 ? (collectedAmount / attemptedAmount) * 100 : 0;

    // Update session with final stats
    await this.prisma.analysisSession.update({
      where: { id: session.id },
      data: {
        totalLines,
        invalidLines,
        attemptedAmount: new Decimal(attemptedAmount),
        collectedAmount: new Decimal(collectedAmount),
        failedAmount: new Decimal(failedAmount),
        successCount,
        failedCount,
        collectionRate: new Decimal(collectionRate),
        uniqueClientCount: uniqueClients,
        failedClientCount,
        followUpClientCount,
        riskyClientCount,
        blockCandidateCount,
      },
    });

    await this.upsertGlobalRiskClients(clientStats, wilaya).catch(error => {
      console.error('Global risk update failed after upload', error);
    });

    return {
      accessToken,
      sessionId: session.id,
    };
  }

  async getSessionResult(accessToken: string): Promise<any> {
    const accessTokenHash = this.utils.hashValue(
      accessToken,
      process.env.ACCESS_TOKEN_SECRET || '',
    );

    const session = await this.prisma.analysisSession.findUnique({
      where: { accessTokenHash },
      include: { lead: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return {
      id: session.id,
      showroomName: session.lead.showroomName,
      wilaya: session.lead.wilaya,
      uploadedAt: session.uploadedAt,
      fileCount: session.fileCount,
      totalLines: session.totalLines,
      invalidLines: session.invalidLines,
      attemptedAmount: session.attemptedAmount,
      collectedAmount: session.collectedAmount,
      failedAmount: session.failedAmount,
      collectionRate: session.collectionRate,
      successCount: session.successCount,
      failedCount: session.failedCount,
      uniqueClientCount: session.uniqueClientCount,
      failedClientCount: session.failedClientCount,
      followUpClientCount: session.followUpClientCount,
      riskyClientCount: session.riskyClientCount,
      blockCandidateCount: session.blockCandidateCount,
    };
  }

  async downloadSummaryCsv(accessToken: string): Promise<string> {
    const session = await this.getSession(accessToken);
    return this.csvExport.generateSummaryCsv(session.id);
  }

  async downloadSummaryXls(accessToken: string): Promise<string> {
    const csv = await this.downloadSummaryCsv(accessToken);
    return this.csvExport.csvToExcelHtml('Resume', csv);
  }

  async downloadFailedClientsCsv(accessToken: string): Promise<string> {
    const session = await this.getSession(accessToken);
    return this.csvExport.generateFailedClientsCsv(session.id);
  }

  async downloadFailedClientsXls(accessToken: string): Promise<string> {
    const csv = await this.downloadFailedClientsCsv(accessToken);
    return this.csvExport.csvToExcelHtml('Clients echoues', csv);
  }

  async downloadFollowUpCsv(accessToken: string): Promise<string> {
    const session = await this.getSession(accessToken);
    return this.csvExport.generateFollowUpCsv(session.id);
  }

  async downloadFollowUpXls(accessToken: string): Promise<string> {
    const csv = await this.downloadFollowUpCsv(accessToken);
    return this.csvExport.csvToExcelHtml('Clients a suivre', csv);
  }

  async downloadRiskyClientsCsv(accessToken: string): Promise<string> {
    const session = await this.getSession(accessToken);
    return this.csvExport.generateRiskyClientsCsv(session.id);
  }

  async downloadRiskyClientsXls(accessToken: string): Promise<string> {
    const csv = await this.downloadRiskyClientsCsv(accessToken);
    return this.csvExport.csvToExcelHtml('Clients a risque', csv);
  }

  async downloadBlockListCsv(accessToken: string): Promise<string> {
    const session = await this.getSession(accessToken);
    return this.csvExport.generateBlockListCsv(session.id);
  }

  async downloadBlockListXls(accessToken: string): Promise<string> {
    const csv = await this.downloadBlockListCsv(accessToken);
    return this.csvExport.csvToExcelHtml('Liste de blocage', csv);
  }

  async downloadAllCleanCsv(accessToken: string): Promise<string> {
    const session = await this.getSession(accessToken);
    return this.csvExport.generateAllCleanLinesCsv(session.id);
  }

  async downloadAllCleanXls(accessToken: string): Promise<string> {
    const csv = await this.downloadAllCleanCsv(accessToken);
    return this.csvExport.csvToExcelHtml('Toutes lignes nettoyees', csv);
  }

  async downloadGlobalRiskXls(adminToken: string): Promise<string> {
    this.validateAdminExportToken(adminToken);

    const clients = await this.prisma.globalRiskClient.findMany({
      orderBy: [{ riskScore: 'desc' }, { totalFailedAmount: 'desc' }],
    });

    const headers = [
      'Nom client',
      'Compte CCP masque',
      'Score risque',
      'Niveau risque',
      'Sessions',
      'Wilayas',
      'Montant total tente',
      'Montant total encaisse',
      'Montant total echoue',
      'Operations encaissees',
      'Operations echouees',
      'References echouees uniques',
      'Mois avec echec',
      'Derniere date echec',
      'Premier upload',
      'Dernier upload',
    ];

    const rows = clients.map(client => [
      client.lastClientName || '',
      client.lastClientAccountMask || '',
      client.riskScore,
      client.riskLevel,
      client.seenInSessions,
      client.seenInWilayas.join(', '),
      client.totalAttemptedAmount,
      client.totalCollectedAmount,
      client.totalFailedAmount,
      client.successLineCount,
      client.failedLineCount,
      client.uniqueFailedReferences,
      client.failedMonthsCount,
      this.formatDateForExport(client.lastFailureDate),
      this.formatDateForExport(client.firstSeenAt),
      this.formatDateForExport(client.lastSeenAt),
    ]);

    return this.buildExcelHtml('Global Risk Clients', headers, rows);
  }

  private async getSession(accessToken: string) {
    const accessTokenHash = this.utils.hashValue(
      accessToken,
      process.env.ACCESS_TOKEN_SECRET || '',
    );

    const session = await this.prisma.analysisSession.findUnique({
      where: { accessTokenHash },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return session;
  }

  private validateAdminExportToken(adminToken: string): void {
    const expectedToken = process.env.ADMIN_EXPORT_TOKEN;
    if (!expectedToken) {
      throw new BadRequestException('Admin export token is not configured');
    }
    if (!adminToken || adminToken !== expectedToken) {
      throw new UnauthorizedException('Invalid admin export token');
    }
  }

  private buildExcelHtml(
    title: string,
    headers: string[],
    rows: unknown[][],
  ): string {
    const headerCells = headers
      .map(header => `<th>${this.escapeHtml(header)}</th>`)
      .join('');
    const bodyRows = rows
      .map(
        row =>
          `<tr>${row
            .map(value => `<td>${this.escapeHtml(this.exportValue(value))}</td>`)
            .join('')}</tr>`,
      )
      .join('');

    return `\uFEFF<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; }
    th, td { border: 1px solid #999; padding: 4px 8px; }
    th { background: #e8eef7; font-weight: bold; }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(title)}</h1>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
  }

  private exportValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  private formatDateForExport(date: Date | null): string {
    if (!date) {
      return '';
    }
    return date.toISOString().substring(0, 10);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private validateFiles(files: { buffer: Buffer; filename: string }[]): void {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    if (files.length > this.maxUploadFiles) {
      throw new BadRequestException(
        `Maximum ${this.maxUploadFiles} files allowed`,
      );
    }

    const maxBytes = this.maxUploadSizeMb * 1024 * 1024;
    const totalBytes = files.reduce((sum, file) => sum + file.buffer.length, 0);

    if (totalBytes > maxBytes) {
      throw new BadRequestException(
        `Maximum upload size is ${this.maxUploadSizeMb} MB`,
      );
    }

    for (const file of files) {
      if (!file.filename.toLowerCase().endsWith('.txt')) {
        throw new BadRequestException(
          `Invalid file type: ${file.filename}. Only .txt files are allowed.`,
        );
      }
    }

    const totalLines = files.reduce((sum, file) => {
      const content = file.buffer.toString('utf-8');
      return sum + content.split(/\r?\n/).filter(line => line.trim().length > 0).length;
    }, 0);

    if (totalLines > this.maxTotalLines) {
      throw new BadRequestException(
        `Maximum ${this.maxTotalLines} lines allowed per analysis`,
      );
    }
  }

  private async upsertGlobalRiskClients(
    clientStats: Map<
      string,
      {
        totalAttempted: number;
        totalCollected: number;
        totalFailed: number;
        successLines: number;
        failedLines: number;
        failedRefs: Set<string>;
        failedMonths: Set<string>;
        lastFailure: Date | null;
        name: string;
        nameNorm: string;
        mask: string;
      }
    >,
    wilaya: string | null,
  ): Promise<void> {
    for (const clientAccountHash of clientStats.keys()) {
      await this.rebuildGlobalRiskClient(clientAccountHash, wilaya);
    }
  }

  private async rebuildGlobalRiskClient(
    clientAccountHash: string,
    currentWilaya: string | null,
  ): Promise<void> {
    const lines = await this.prisma.ccpLine.findMany({
      where: { clientAccountHash },
      include: {
        session: {
          include: {
            lead: true,
          },
        },
      },
      orderBy: [{ operationDate: 'asc' }, { id: 'asc' }],
    });

    if (lines.length === 0) {
      return;
    }

    const existing = await this.prisma.globalRiskClient.findUnique({
      where: { clientAccountHash },
    });

    let totalAttemptedAmount = 0;
    let totalCollectedAmount = 0;
    let totalFailedAmount = 0;
    let successLineCount = 0;
    let failedLineCount = 0;
    const failedReferences = new Set<string>();
    const failedMonths = new Set<string>();
    const sessionIds = new Set<number>();
    const wilayaSet = new Set<string>(existing?.seenInWilayas ?? []);
    let lastFailureDate: Date | null = null;

    for (const line of lines) {
      const amount = Number(line.amount);
      totalAttemptedAmount += amount;
      sessionIds.add(line.sessionId);

      const lineWilaya = line.session?.lead?.wilaya;
      if (lineWilaya?.trim()) {
        wilayaSet.add(lineWilaya.trim());
      }

      if (line.code === 0) {
        totalCollectedAmount += amount;
        successLineCount++;
      } else if (line.code === 1) {
        totalFailedAmount += amount;
        failedLineCount++;
        failedReferences.add(line.cleanReference);
        failedMonths.add(line.operationDate.toISOString().substring(0, 7));
        if (!lastFailureDate || line.operationDate > lastFailureDate) {
          lastFailureDate = line.operationDate;
        }
      }
    }

    if (currentWilaya?.trim()) {
      wilayaSet.add(currentWilaya.trim());
    }

    const latestLine = lines[lines.length - 1];
    const firstSeenAt = existing?.firstSeenAt ?? new Date();
    const now = new Date();
    const riskData = {
      clientAccountHash,
      clientAccountMask: latestLine.clientAccountMask,
      clientName: latestLine.clientName,
      clientNameNorm: latestLine.clientNameNorm,
      totalAttemptedAmount,
      totalCollectedAmount,
      totalFailedAmount,
      successLineCount,
      failedLineCount,
      uniqueFailedReferences: failedReferences.size,
      failedMonthsCount: failedMonths.size,
      lastFailureDate,
    };
    const risk = this.riskScoring.calculateRiskScore(riskData);

    const data = {
      clientNameHash: latestLine.clientNameNorm
        ? this.utils.hashValue(latestLine.clientNameNorm, this.clientHashSalt)
        : null,
      lastClientName: latestLine.clientName,
      lastClientAccountMask: latestLine.clientAccountMask,
      lastSeenAt: now,
      seenInSessions: sessionIds.size,
      seenInWilayas: Array.from(wilayaSet),
      totalAttemptedAmount: new Decimal(totalAttemptedAmount),
      totalCollectedAmount: new Decimal(totalCollectedAmount),
      totalFailedAmount: new Decimal(totalFailedAmount),
      successLineCount,
      failedLineCount,
      uniqueFailedReferences: failedReferences.size,
      failedMonthsCount: failedMonths.size,
      lastFailureDate,
      riskScore: risk.score,
      riskLevel: risk.level,
    };

    if (!existing) {
      await this.prisma.globalRiskClient.create({
        data: {
          clientAccountHash,
          firstSeenAt,
          ...data,
        },
      });
      return;
    }

    await this.prisma.globalRiskClient.update({
      where: { clientAccountHash },
      data,
    });
  }
}
