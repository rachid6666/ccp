import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RiskClientData, RiskScoringService } from './risk-scoring.service';

interface ClientExportRow extends RiskClientData {
  uniqueFailedMonthsLabel: string;
  recommendation: string;
}

@Injectable()
export class CsvExportService {
  constructor(
    private prisma: PrismaService,
    private riskScoring: RiskScoringService,
  ) {}

  escapeCsvValue(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  csvToExcelHtml(title: string, csv: string): string {
    const rows = csv
      .split(/\r?\n/)
      .filter(row => row.length > 0)
      .map(row => this.parseCsvRow(row));
    const [headers = [], ...bodyRows] = rows;
    const headerCells = headers
      .map(header => `<th>${this.escapeHtml(header)}</th>`)
      .join('');
    const tableRows = bodyRows
      .map(
        row =>
          `<tr>${row
            .map(value => `<td>${this.escapeHtml(value)}</td>`)
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
    <tbody>${tableRows}</tbody>
  </table>
</body>
</html>`;
  }

  async generateSummaryCsv(sessionId: number): Promise<string> {
    const session = await this.prisma.analysisSession.findUnique({
      where: { id: sessionId },
      include: { lead: true },
    });

    if (!session) return '';

    const rows: string[] = [];
    rows.push(
      'nom_showroom,wilaya,nombre_fichiers,nombre_lignes,lignes_invalides,montant_total_tente,montant_encaisse,montant_echoue,taux_encaissement,nombre_clients,clients_avec_echec,clients_a_suivre,clients_a_risque,clients_a_bloquer',
    );

    rows.push(
      `${this.escapeCsvValue(session.lead.showroomName)},` +
        `${this.escapeCsvValue(session.lead.wilaya || '')},` +
        `${session.fileCount},` +
        `${session.totalLines},` +
        `${session.invalidLines},` +
        `${session.attemptedAmount},` +
        `${session.collectedAmount},` +
        `${session.failedAmount},` +
        `${session.collectionRate},` +
        `${session.uniqueClientCount},` +
        `${session.failedClientCount},` +
        `${session.followUpClientCount},` +
        `${session.riskyClientCount},` +
        `${session.blockCandidateCount}`,
    );

    return rows.join('\n');
  }

  async generateFailedClientsCsv(sessionId: number): Promise<string> {
    const rows: string[] = [];
    rows.push(
      'nom_client,compte_ccp_masque,montant_echoue,montant_encaisse,taux_encaissement,references_echouees_uniques,mois_echec,derniere_date_echec,score_risque,niveau_risque,recommandation',
    );

    const clients = await this.getClientExportRows(sessionId);
    for (const client of clients.filter(c => c.totalFailedAmount > 0)) {
      const risk = this.riskScoring.calculateRiskScore(client);
      const successRate =
        client.totalAttemptedAmount > 0
          ? ((client.totalCollectedAmount / client.totalAttemptedAmount) * 100).toFixed(2)
          : '0.00';

      rows.push(
        `${this.escapeCsvValue(client.clientName)},` +
          `${this.escapeCsvValue(client.clientAccountMask)},` +
          `${client.totalFailedAmount.toFixed(2)},` +
          `${client.totalCollectedAmount.toFixed(2)},` +
          `${successRate},` +
          `${client.uniqueFailedReferences},` +
          `${client.uniqueFailedMonthsLabel},` +
          `${client.lastFailureDate ? client.lastFailureDate.toLocaleDateString('fr-FR') : ''},` +
          `${risk.score},${risk.level},${this.escapeCsvValue(client.recommendation)}`,
      );
    }

    return rows.join('\n');
  }

  async generateFollowUpCsv(sessionId: number): Promise<string> {
    const rows: string[] = [];
    rows.push(
      'nom_client,compte_ccp_masque,montant_echoue,derniere_date_echec,raison,recommandation',
    );

    const clients = await this.getClientExportRows(sessionId);
    for (const client of clients.filter(c => this.riskScoring.classifyFollowUp(c))) {
      rows.push(
        `${this.escapeCsvValue(client.clientName)},` +
          `${this.escapeCsvValue(client.clientAccountMask)},` +
          `${client.totalFailedAmount.toFixed(2)},` +
          `${client.lastFailureDate ? client.lastFailureDate.toLocaleDateString('fr-FR') : ''},` +
          `Paiement échoué,Client à suivre`,
      );
    }

    return rows.join('\n');
  }

  async generateRiskyClientsCsv(sessionId: number): Promise<string> {
    const rows: string[] = [];
    rows.push(
      'nom_client,compte_ccp_masque,montant_total_tente,montant_encaisse,montant_echoue,taux_encaissement,references_echouees_uniques,mois_echec,score_risque,niveau_risque',
    );

    const clients = await this.getClientExportRows(sessionId);
    for (const client of clients.filter(c => this.riskScoring.classifyRisky(c))) {
      const risk = this.riskScoring.calculateRiskScore(client);
      const successRate =
        client.totalAttemptedAmount > 0
          ? ((client.totalCollectedAmount / client.totalAttemptedAmount) * 100).toFixed(2)
          : '0.00';

      rows.push(
        `${this.escapeCsvValue(client.clientName)},` +
          `${this.escapeCsvValue(client.clientAccountMask)},` +
          `${client.totalAttemptedAmount.toFixed(2)},` +
          `${client.totalCollectedAmount.toFixed(2)},` +
          `${client.totalFailedAmount.toFixed(2)},` +
          `${successRate},` +
          `${client.uniqueFailedReferences},` +
          `${client.uniqueFailedMonthsLabel},` +
          `${risk.score},${risk.level}`,
      );
    }

    return rows.join('\n');
  }

  async generateBlockListCsv(sessionId: number): Promise<string> {
    const rows: string[] = [];
    rows.push(
      'nom_client,compte_ccp_masque,montant_echoue,montant_encaisse,references_echouees_uniques,mois_echec,raison_blocage,recommandation',
    );

    const clients = await this.getClientExportRows(sessionId);
    for (const client of clients.filter(c => this.riskScoring.classifyBlockCandidate(c))) {
      const reason = this.blockReason(client);

      rows.push(
        `${this.escapeCsvValue(client.clientName)},` +
          `${this.escapeCsvValue(client.clientAccountMask)},` +
          `${client.totalFailedAmount.toFixed(2)},` +
          `${client.totalCollectedAmount.toFixed(2)},` +
          `${client.uniqueFailedReferences},` +
          `${client.uniqueFailedMonthsLabel},` +
          `${this.escapeCsvValue(reason)},` +
          `Bloquer toute nouvelle facilité jusqu'au règlement`,
      );
    }

    return rows.join('\n');
  }

  async generateAllCleanLinesCsv(sessionId: number): Promise<string> {
    const lines = await this.prisma.ccpLine.findMany({
      where: { sessionId },
      include: { file: true },
      orderBy: { operationDate: 'desc' },
    });

    const rows: string[] = [];
    rows.push(
      'nom_client,compte_ccp_masque,montant,date_operation,code,statut,jours_retard,reference,reference_normalisee,nom_fichier',
    );

    for (const line of lines) {
      const statut = line.code === 0 ? 'Encaissé' : 'Échoué';
      rows.push(
        `${this.escapeCsvValue(line.clientName)},` +
          `${this.escapeCsvValue(line.clientAccountMask)},` +
          `${line.amount},` +
          `${line.operationDate.toLocaleDateString('fr-FR')},` +
          `${line.code},` +
          `${statut},` +
          `${line.delayDays},` +
          `${this.escapeCsvValue(line.reference)},` +
          `${this.escapeCsvValue(line.cleanReference)},` +
          `${this.escapeCsvValue(line.file.originalFilename || line.file.filename)}`,
      );
    }

    return rows.join('\n');
  }

  private async getClientExportRows(sessionId: number): Promise<ClientExportRow[]> {
    const paymentCycleStartDay =
      await this.getSessionPaymentCycleStartDay(sessionId);
    const lines = await this.prisma.ccpLine.findMany({
      where: { sessionId },
      include: { file: true },
      orderBy: [{ clientAccountHash: 'asc' }, { operationDate: 'asc' }],
    });
    const lineOccurrenceCounts = new Map<string, number>();
    const seenLineOccurrenceKeys = new Set<string>();

    const clients = new Map<
      string,
      ClientExportRow & {
        paymentGroups: Map<
          string,
          {
            failedAmount: number;
            failedLines: number;
            successLines: number;
            cleanReference: string;
            month: string;
            paymentCycleStartDay: number;
            lastFailureDate: Date | null;
          }
        >;
      }
    >();

    for (const line of lines) {
      const lineOccurrenceKey = this.lineOccurrenceKey(
        line,
        lineOccurrenceCounts,
      );
      if (seenLineOccurrenceKeys.has(lineOccurrenceKey)) {
        continue;
      }
      seenLineOccurrenceKeys.add(lineOccurrenceKey);

      const hash = line.clientAccountHash;
      if (!clients.has(hash)) {
        clients.set(hash, {
          clientAccountHash: hash,
          clientAccountMask: line.clientAccountMask,
          clientName: line.clientName,
          clientNameNorm: line.clientNameNorm,
          totalAttemptedAmount: 0,
          totalCollectedAmount: 0,
          totalFailedAmount: 0,
          successLineCount: 0,
          failedLineCount: 0,
          uniqueFailedReferences: 0,
          failedMonthsCount: 0,
          lastFailureDate: null,
          uniqueFailedMonthsLabel: '',
          recommendation: 'Client à suivre',
          paymentGroups: new Map(),
        });
      }

      const client = clients.get(hash)!;
      const amount = Number(line.amount);
      const paymentGroupKey = this.paymentGroupKey(line, paymentCycleStartDay);
      if (!client.paymentGroups.has(paymentGroupKey)) {
        client.paymentGroups.set(paymentGroupKey, {
          failedAmount: 0,
          failedLines: 0,
          successLines: 0,
          cleanReference: line.cleanReference,
          month: this.paymentCycleMonth(
            line.operationDate,
            paymentCycleStartDay,
          ),
          paymentCycleStartDay,
          lastFailureDate: null,
        });
      }
      const paymentGroup = client.paymentGroups.get(paymentGroupKey)!;

      if (line.code === 0) {
        client.totalCollectedAmount += amount;
        client.successLineCount++;
        paymentGroup.successLines++;
      } else if (line.code === 1) {
        paymentGroup.failedAmount += amount;
        paymentGroup.failedLines++;
        if (
          !paymentGroup.lastFailureDate ||
          line.operationDate > paymentGroup.lastFailureDate
        ) {
          paymentGroup.lastFailureDate = line.operationDate;
        }
      }
    }

    return Array.from(clients.values()).map(client => {
      const unsettledFailures = this.summarizeUnsettledPaymentGroups(
        client.paymentGroups,
      );
      client.totalFailedAmount = unsettledFailures.totalFailedAmount;
      client.totalAttemptedAmount =
        client.totalCollectedAmount + unsettledFailures.totalFailedAmount;
      client.failedLineCount = unsettledFailures.failedLineCount;
      client.uniqueFailedReferences = unsettledFailures.uniqueFailedReferences;
      client.failedMonthsCount = unsettledFailures.failedMonthsCount;
      client.lastFailureDate = unsettledFailures.lastFailureDate;
      client.uniqueFailedMonthsLabel = unsettledFailures.failedMonthsLabel;
      client.recommendation = this.riskScoring.classifyBlockCandidate(client)
        ? "Bloquer toute nouvelle facilité jusqu'au règlement"
        : this.riskScoring.classifyRisky(client)
          ? 'Contacter le client et vérifier la situation'
          : 'Client à suivre';
      return client;
    });
  }

  private blockReason(client: RiskClientData): string {
    if (client.totalCollectedAmount === 0 && client.totalFailedAmount >= 20000) {
      return 'Aucun montant encaissé avec échec significatif';
    }
    if (client.totalFailedAmount >= 50000) {
      return 'Montant échoué critique';
    }
    return 'Échecs sur plus de 3 mois';
  }

  private summarizeUnsettledPaymentGroups(
    paymentGroups: Map<
      string,
      {
        failedAmount: number;
        failedLines: number;
        successLines: number;
        cleanReference: string;
        month: string;
        paymentCycleStartDay: number;
        lastFailureDate: Date | null;
      }
    >,
  ): {
    totalFailedAmount: number;
    failedLineCount: number;
    uniqueFailedReferences: number;
    failedMonthsCount: number;
    failedMonthsLabel: string;
    lastFailureDate: Date | null;
  } {
    let totalFailedAmount = 0;
    let failedLineCount = 0;
    let lastFailureDate: Date | null = null;
    const failedReferences = new Set<string>();
    const failedMonths = new Set<string>();

    for (const group of paymentGroups.values()) {
      if (group.failedLines === 0 || group.successLines > 0) {
        continue;
      }

      totalFailedAmount += group.failedAmount;
      failedLineCount += group.failedLines;
      failedReferences.add(group.cleanReference);
      failedMonths.add(group.month);
      if (
        group.lastFailureDate &&
        (!lastFailureDate || group.lastFailureDate > lastFailureDate)
      ) {
        lastFailureDate = group.lastFailureDate;
      }
    }

    return {
      totalFailedAmount,
      failedLineCount,
      uniqueFailedReferences: failedReferences.size,
      failedMonthsCount: failedMonths.size,
      failedMonthsLabel: Array.from(failedMonths).join('|'),
      lastFailureDate,
    };
  }

  private paymentGroupKey(line: {
    ccpAccount: string;
    cleanReference: string;
    operationDate: Date;
  }, paymentCycleStartDay = 5): string {
    return [
      line.ccpAccount,
      line.cleanReference,
      paymentCycleStartDay,
      this.paymentCycleMonth(line.operationDate, paymentCycleStartDay),
    ].join('|');
  }

  private lineEventKey(line: {
    clientAccountHash: string;
    ccpAccount: string;
    cleanReference: string;
    operationDate: Date;
    code: number;
    amount: unknown;
  }): string {
    return [
      line.clientAccountHash,
      line.ccpAccount,
      line.cleanReference,
      line.operationDate.toISOString(),
      line.code,
      Number(line.amount).toFixed(2),
    ].join('|');
  }

  private lineOccurrenceKey(
    line: {
      clientAccountHash: string;
      ccpAccount: string;
      cleanReference: string;
      operationDate: Date;
      code: number;
      amount: unknown;
      file?: { id?: number; filename?: string; originalFilename?: string };
    },
    occurrenceCounts: Map<string, number>,
  ): string {
    const filename =
      line.file?.originalFilename || line.file?.filename || 'unknown-file';
    const fileInstance = line.file?.id ?? 'unknown-file-instance';
    const eventKey = this.lineEventKey(line);
    const occurrenceCountKey = `${fileInstance}|${filename}|${eventKey}`;
    const occurrence = (occurrenceCounts.get(occurrenceCountKey) || 0) + 1;
    occurrenceCounts.set(occurrenceCountKey, occurrence);
    return `${filename}|${eventKey}|${occurrence}`;
  }

  private paymentCycleMonth(date: Date, paymentCycleStartDay = 5): string {
    const cycleDate = new Date(date);
    if (cycleDate.getUTCDate() < paymentCycleStartDay) {
      cycleDate.setUTCMonth(cycleDate.getUTCMonth() - 1);
    }
    return cycleDate.toISOString().substring(0, 7);
  }

  private async getSessionPaymentCycleStartDay(sessionId: number): Promise<number> {
    if (!this.prisma.analysisSession?.findUnique) {
      return 5;
    }

    const session = await this.prisma.analysisSession.findUnique({
      where: { id: sessionId },
      include: { lead: true },
    });

    return session?.lead?.paymentCycleStartDay ?? 5;
  }

  private parseCsvRow(row: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < row.length; index++) {
      const char = row[index];
      const nextChar = row[index + 1];

      if (char === '"' && inQuotes && nextChar === '"') {
        current += '"';
        index++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current);
    return values;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
