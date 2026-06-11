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
    const lines = await this.prisma.ccpLine.findMany({
      where: { sessionId },
      orderBy: [{ clientAccountHash: 'asc' }, { operationDate: 'asc' }],
    });

    const clients = new Map<string, ClientExportRow & { failedRefs: Set<string>; failedMonths: Set<string> }>();

    for (const line of lines) {
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
          failedRefs: new Set<string>(),
          failedMonths: new Set<string>(),
        });
      }

      const client = clients.get(hash)!;
      const amount = Number(line.amount);
      client.totalAttemptedAmount += amount;

      if (line.code === 0) {
        client.totalCollectedAmount += amount;
        client.successLineCount++;
      } else if (line.code === 1) {
        client.totalFailedAmount += amount;
        client.failedLineCount++;
        client.failedRefs.add(line.cleanReference);
        client.failedMonths.add(line.operationDate.toISOString().substring(0, 7));
        if (!client.lastFailureDate || line.operationDate > client.lastFailureDate) {
          client.lastFailureDate = line.operationDate;
        }
      }
    }

    return Array.from(clients.values()).map(client => {
      client.uniqueFailedReferences = client.failedRefs.size;
      client.failedMonthsCount = client.failedMonths.size;
      client.uniqueFailedMonthsLabel = Array.from(client.failedMonths).join('|');
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
    if (client.uniqueFailedReferences >= 5) {
      return 'Nombre élevé de références échouées';
    }
    return 'Échecs sur plusieurs mois';
  }
}
