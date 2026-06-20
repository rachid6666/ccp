import { CsvExportService } from '../src/ccp/csv-export.service';
import { RiskScoringService } from '../src/ccp/risk-scoring.service';

describe('CsvExportService', () => {
  it('should generate summary CSV with expected columns', async () => {
    const prisma = {
      analysisSession: {
        findUnique: jest.fn().mockResolvedValue({
          lead: { showroomName: 'Showroom Test', wilaya: 'Alger' },
          fileCount: 2,
          totalLines: 10,
          invalidLines: 1,
          attemptedAmount: '10000.00',
          collectedAmount: '7000.00',
          failedAmount: '3000.00',
          collectionRate: '70.00',
          uniqueClientCount: 4,
          failedClientCount: 2,
          followUpClientCount: 2,
          riskyClientCount: 1,
          blockCandidateCount: 0,
        }),
      },
    };

    const service = new CsvExportService(prisma as any, new RiskScoringService());
    const csv = await service.generateSummaryCsv(1);

    expect(csv).toContain('nom_showroom,wilaya,nombre_fichiers');
    expect(csv).toContain('Showroom Test,Alger,2');
  });

  it('should exclude same-month references paid later from failed client exports', async () => {
    const prisma = {
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            clientAccountHash: 'hash1',
            clientAccountMask: '******8367',
            clientName: 'M.AHMED',
            clientNameNorm: 'm ahmed',
            amount: 1200,
            operationDate: new Date('2025-06-05T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 1,
            cleanReference: 'FAHMED250601202',
          },
          {
            clientAccountHash: 'hash1',
            clientAccountMask: '******8367',
            clientName: 'M.AHMED',
            clientNameNorm: 'm ahmed',
            amount: 1200,
            operationDate: new Date('2025-06-25T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 0,
            cleanReference: 'FAHMED250601202',
          },
        ]),
      },
    };

    const service = new CsvExportService(prisma as any, new RiskScoringService());
    const csv = await service.generateFailedClientsCsv(1);

    expect(csv).toBe(
      'nom_client,compte_ccp_masque,montant_echoue,montant_encaisse,taux_encaissement,references_echouees_uniques,mois_echec,derniere_date_echec,score_risque,niveau_risque,recommandation',
    );
  });

  it('should treat day 1 to 4 as part of the previous payment cycle', async () => {
    const prisma = {
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            clientAccountHash: 'hash1',
            clientAccountMask: '******8367',
            clientName: 'M.AHMED',
            clientNameNorm: 'm ahmed',
            amount: 1200,
            operationDate: new Date('2025-06-30T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 1,
            cleanReference: 'FAHMED250601202',
          },
          {
            clientAccountHash: 'hash1',
            clientAccountMask: '******8367',
            clientName: 'M.AHMED',
            clientNameNorm: 'm ahmed',
            amount: 1200,
            operationDate: new Date('2025-07-04T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 0,
            cleanReference: 'FAHMED250601202',
          },
        ]),
      },
    };

    const service = new CsvExportService(prisma as any, new RiskScoringService());
    const csv = await service.generateFailedClientsCsv(1);

    expect(csv).not.toContain('M.AHMED');
  });

  it('should use the session payment cycle start day for failed client exports', async () => {
    const prisma = {
      analysisSession: {
        findUnique: jest.fn().mockResolvedValue({
          lead: { paymentCycleStartDay: 17 },
        }),
      },
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            clientAccountHash: 'hash1',
            clientAccountMask: '******8367',
            clientName: 'M.AHMED',
            clientNameNorm: 'm ahmed',
            amount: 1200,
            operationDate: new Date('2025-01-31T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 1,
            cleanReference: 'FAHMED250601202',
          },
          {
            clientAccountHash: 'hash1',
            clientAccountMask: '******8367',
            clientName: 'M.AHMED',
            clientNameNorm: 'm ahmed',
            amount: 1200,
            operationDate: new Date('2025-02-16T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 0,
            cleanReference: 'FAHMED250601202',
          },
        ]),
      },
    };

    const service = new CsvExportService(prisma as any, new RiskScoringService());
    const csv = await service.generateFailedClientsCsv(1);

    expect(csv).not.toContain('M.AHMED');
  });

  it('should not double-count duplicate transaction events in failed client exports', async () => {
    const duplicateFailure = {
      clientAccountHash: 'hash1',
      clientAccountMask: '******8367',
      clientName: 'M.AHMED',
      clientNameNorm: 'm ahmed',
      amount: 1200,
      operationDate: new Date('2025-06-05T00:00:00.000Z'),
      ccpAccount: '0021008367',
      code: 1,
      cleanReference: 'FAHMED250601202',
    };
    const prisma = {
      analysisSession: {
        findUnique: jest.fn().mockResolvedValue({
          lead: { paymentCycleStartDay: 5 },
        }),
      },
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            file: { id: 1, originalFilename: 'RESULT-21008367-WISAM.txt' },
            ...duplicateFailure,
          },
          {
            file: { id: 2, originalFilename: 'RESULT-21008367-WISAM.txt' },
            ...duplicateFailure,
          },
        ]),
      },
    };

    const service = new CsvExportService(prisma as any, new RiskScoringService());
    const csv = await service.generateFailedClientsCsv(1);

    expect(csv).toContain('M.AHMED,******8367,1200.00,0.00');
    expect(csv).not.toContain('2400.00');
  });

  it('should count repeated paid references inside the same source file in exports', async () => {
    const repeatedPaid = {
      clientAccountHash: 'hash1',
      clientAccountMask: '******0042',
      clientName: 'M.KERSAOUI BILAL',
      clientNameNorm: 'm kersaoui bilal',
      amount: 2400,
      operationDate: new Date('2025-06-25T00:00:00.000Z'),
      ccpAccount: '00210042',
      code: 0,
      cleanReference: 'PAHMED250607',
      file: { id: 1, originalFilename: 'RESULT-21008367-WISAM.txt' },
    };
    const prisma = {
      analysisSession: {
        findUnique: jest.fn().mockResolvedValue({
          lead: { paymentCycleStartDay: 5 },
        }),
      },
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([repeatedPaid, repeatedPaid]),
      },
    };

    const service = new CsvExportService(prisma as any, new RiskScoringService());
    const rows = await (service as any).getClientExportRows(1);

    expect(rows[0].totalAttemptedAmount).toBe(4800);
    expect(rows[0].totalCollectedAmount).toBe(4800);
    expect(rows[0].totalFailedAmount).toBe(0);
    expect(rows[0].successLineCount).toBe(2);
  });

  it('should count duplicate paid references across repeated uploaded files in exports', async () => {
    const repeatedPaid = {
      clientAccountHash: 'hash1',
      clientAccountMask: '******0042',
      clientName: 'M.KERSAOUI BILAL',
      clientNameNorm: 'm kersaoui bilal',
      amount: 2400,
      operationDate: new Date('2025-06-25T00:00:00.000Z'),
      ccpAccount: '00210042',
      code: 0,
      cleanReference: 'PAHMED250607',
    };
    const prisma = {
      analysisSession: {
        findUnique: jest.fn().mockResolvedValue({
          lead: { paymentCycleStartDay: 5 },
        }),
      },
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            file: { id: 1, originalFilename: 'RESULT-21008367-WISAM.txt' },
            ...repeatedPaid,
          },
          {
            file: { id: 2, originalFilename: 'RESULT-21008367-WISAM.txt' },
            ...repeatedPaid,
          },
        ]),
      },
    };

    const service = new CsvExportService(prisma as any, new RiskScoringService());
    const rows = await (service as any).getClientExportRows(1);

    expect(rows[0].totalAttemptedAmount).toBe(4800);
    expect(rows[0].totalCollectedAmount).toBe(4800);
    expect(rows[0].totalFailedAmount).toBe(0);
    expect(rows[0].successLineCount).toBe(2);
  });
});
