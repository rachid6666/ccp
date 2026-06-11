import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CcpParserService } from './ccp-parser.service';
import { RiskScoringService } from './risk-scoring.service';
import { UtilsService } from '@/common/utils.service';
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

    await this.upsertGlobalRiskClients(clientStats, wilaya);

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

  async downloadFailedClientsCsv(accessToken: string): Promise<string> {
    const session = await this.getSession(accessToken);
    return this.csvExport.generateFailedClientsCsv(session.id);
  }

  async downloadFollowUpCsv(accessToken: string): Promise<string> {
    const session = await this.getSession(accessToken);
    return this.csvExport.generateFollowUpCsv(session.id);
  }

  async downloadRiskyClientsCsv(accessToken: string): Promise<string> {
    const session = await this.getSession(accessToken);
    return this.csvExport.generateRiskyClientsCsv(session.id);
  }

  async downloadBlockListCsv(accessToken: string): Promise<string> {
    const session = await this.getSession(accessToken);
    return this.csvExport.generateBlockListCsv(session.id);
  }

  async downloadAllCleanCsv(accessToken: string): Promise<string> {
    const session = await this.getSession(accessToken);
    return this.csvExport.generateAllCleanLinesCsv(session.id);
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
    const now = new Date();

    for (const [clientAccountHash, stats] of clientStats.entries()) {
      const riskData = {
        clientAccountHash,
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
      const risk = this.riskScoring.calculateRiskScore(riskData);
      const existing = await this.prisma.globalRiskClient.findUnique({
        where: { clientAccountHash },
      });
      const wilayaSet = new Set<string>(existing?.seenInWilayas ?? []);
      if (wilaya?.trim()) {
        wilayaSet.add(wilaya.trim());
      }

      if (!existing) {
        await this.prisma.globalRiskClient.create({
          data: {
            clientAccountHash,
            clientNameHash: stats.nameNorm
              ? this.utils.hashValue(stats.nameNorm, this.clientHashSalt)
              : null,
            firstSeenAt: now,
            lastSeenAt: now,
            seenInSessions: 1,
            seenInWilayas: Array.from(wilayaSet),
            totalAttemptedAmount: new Decimal(stats.totalAttempted),
            totalCollectedAmount: new Decimal(stats.totalCollected),
            totalFailedAmount: new Decimal(stats.totalFailed),
            successLineCount: stats.successLines,
            failedLineCount: stats.failedLines,
            uniqueFailedReferences: stats.failedRefs.size,
            failedMonthsCount: stats.failedMonths.size,
            lastFailureDate: stats.lastFailure,
            riskScore: risk.score,
            riskLevel: risk.level,
          },
        });
        continue;
      }

      const totalAttemptedAmount =
        Number(existing.totalAttemptedAmount) + stats.totalAttempted;
      const totalCollectedAmount =
        Number(existing.totalCollectedAmount) + stats.totalCollected;
      const totalFailedAmount = Number(existing.totalFailedAmount) + stats.totalFailed;
      const successLineCount = existing.successLineCount + stats.successLines;
      const failedLineCount = existing.failedLineCount + stats.failedLines;
      const uniqueFailedReferences =
        existing.uniqueFailedReferences + stats.failedRefs.size;
      const failedMonthsCount = existing.failedMonthsCount + stats.failedMonths.size;
      const lastFailureDate =
        existing.lastFailureDate && stats.lastFailure
          ? existing.lastFailureDate > stats.lastFailure
            ? existing.lastFailureDate
            : stats.lastFailure
          : existing.lastFailureDate ?? stats.lastFailure;

      const aggregateRisk = this.riskScoring.calculateRiskScore({
        clientAccountHash,
        clientAccountMask: stats.mask,
        clientName: stats.name,
        clientNameNorm: stats.nameNorm,
        totalAttemptedAmount,
        totalCollectedAmount,
        totalFailedAmount,
        successLineCount,
        failedLineCount,
        uniqueFailedReferences,
        failedMonthsCount,
        lastFailureDate,
      });

      await this.prisma.globalRiskClient.update({
        where: { clientAccountHash },
        data: {
          lastSeenAt: now,
          seenInSessions: { increment: 1 },
          seenInWilayas: Array.from(wilayaSet),
          totalAttemptedAmount: new Decimal(totalAttemptedAmount),
          totalCollectedAmount: new Decimal(totalCollectedAmount),
          totalFailedAmount: new Decimal(totalFailedAmount),
          successLineCount,
          failedLineCount,
          uniqueFailedReferences,
          failedMonthsCount,
          lastFailureDate,
          riskScore: aggregateRisk.score,
          riskLevel: aggregateRisk.level,
        },
      });
    }
  }
}
