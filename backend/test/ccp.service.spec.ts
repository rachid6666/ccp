import { BadRequestException } from '@nestjs/common';
import { CcpParserService } from '../src/ccp/ccp-parser.service';
import { CcpService } from '../src/ccp/ccp.service';
import { RiskScoringService } from '../src/ccp/risk-scoring.service';
import { UtilsService } from '../src/common/utils.service';

describe('CcpService upload limits and preview', () => {
  const sampleLine =
    '0000565172M.MENAOUER ALI             00000000786.6705/03/20260021008367000FMECHE251101705';

  let service: CcpService;

  beforeEach(() => {
    process.env.MAX_UPLOAD_FILES = '100';
    process.env.MAX_UPLOAD_SIZE_MB = '50';

    const utils = new UtilsService();
    service = new CcpService(
      {} as any,
      new CcpParserService(utils),
      new RiskScoringService(),
      utils,
      {} as any,
    );
  });

  it('should preview more than 30 files in one session', async () => {
    const files = Array.from({ length: 31 }, (_, index) => ({
      filename: `RESULT-${index}.txt`,
      buffer: Buffer.from(sampleLine),
    }));

    const result = await service.previewFiles(files);

    expect(result.fileCount).toBe(31);
    expect(result.totalLines).toBe(31);
    expect(result.collectedAmount).toBeCloseTo(31 * 786.67);
    expect(result.failedAmount).toBe(0);
  });

  it('should reject more than 100 files', async () => {
    const files = Array.from({ length: 101 }, (_, index) => ({
      filename: `RESULT-${index}.txt`,
      buffer: Buffer.from(sampleLine),
    }));

    await expect(service.previewFiles(files)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should reject non txt files', async () => {
    await expect(
      service.previewFiles([
        {
          filename: 'RESULT.csv',
          buffer: Buffer.from(sampleLine),
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('should rebuild global risk from historical lines without double-counting months or references', async () => {
    const prisma = {
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            sessionId: 10,
            clientAccountHash: 'hash1',
            clientAccountMask: '******5172',
            clientName: 'M.MENAOUER ALI',
            clientNameNorm: 'm menaouer ali',
            amount: 1000,
            operationDate: new Date('2026-03-05T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 1,
            cleanReference: 'REF-1',
            session: { lead: { wilaya: 'Alger' } },
          },
          {
            id: 2,
            sessionId: 10,
            clientAccountHash: 'hash1',
            clientAccountMask: '******5172',
            clientName: 'M.MENAOUER ALI',
            clientNameNorm: 'm menaouer ali',
            amount: 1500,
            operationDate: new Date('2026-03-20T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 1,
            cleanReference: 'REF-1',
            session: { lead: { wilaya: 'Alger' } },
          },
          {
            id: 3,
            sessionId: 11,
            clientAccountHash: 'hash1',
            clientAccountMask: '******5172',
            clientName: 'M.MENAOUER ALI',
            clientNameNorm: 'm menaouer ali',
            amount: 5000,
            operationDate: new Date('2026-04-10T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 0,
            cleanReference: 'REF-2',
            session: { lead: { wilaya: 'Oran' } },
          },
        ]),
      },
      globalRiskClient: {
        findUnique: jest.fn().mockResolvedValue({
          firstSeenAt: new Date('2026-01-01T00:00:00.000Z'),
          seenInWilayas: ['Blida'],
        }),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const utils = new UtilsService();
    service = new CcpService(
      prisma as any,
      new CcpParserService(utils),
      new RiskScoringService(),
      utils,
      {} as any,
    );

    await (service as any).rebuildGlobalRiskClient('hash1', 'Setif');

    expect(prisma.globalRiskClient.update).toHaveBeenCalledTimes(1);
    expect(prisma.globalRiskClient.create).not.toHaveBeenCalled();

    const updateArgs = prisma.globalRiskClient.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ clientAccountHash: 'hash1' });
    expect(updateArgs.data.lastClientName).toBe('M.MENAOUER ALI');
    expect(updateArgs.data.lastClientAccountMask).toBe('******5172');
    expect(Number(updateArgs.data.totalAttemptedAmount)).toBe(7500);
    expect(Number(updateArgs.data.totalCollectedAmount)).toBe(5000);
    expect(Number(updateArgs.data.totalFailedAmount)).toBe(2500);
    expect(updateArgs.data.successLineCount).toBe(1);
    expect(updateArgs.data.failedLineCount).toBe(2);
    expect(updateArgs.data.uniqueFailedReferences).toBe(1);
    expect(updateArgs.data.failedMonthsCount).toBe(1);
    expect(updateArgs.data.seenInSessions).toBe(2);
    expect(updateArgs.data.seenInWilayas.sort()).toEqual([
      'Alger',
      'Blida',
      'Oran',
      'Setif',
    ]);
  });

  it('should not count a same-month failed reference as unpaid when later collected', async () => {
    const prisma = {
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            sessionId: 10,
            clientAccountHash: 'hash1',
            clientAccountMask: '******8367',
            clientName: 'M.AHMED',
            clientNameNorm: 'm ahmed',
            amount: 1200,
            operationDate: new Date('2025-06-05T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 1,
            cleanReference: 'FAHMED250601202',
            session: { lead: { wilaya: 'Setif' } },
          },
          {
            id: 2,
            sessionId: 10,
            clientAccountHash: 'hash1',
            clientAccountMask: '******8367',
            clientName: 'M.AHMED',
            clientNameNorm: 'm ahmed',
            amount: 1200,
            operationDate: new Date('2025-06-25T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 0,
            cleanReference: 'FAHMED250601202',
            session: { lead: { wilaya: 'Setif' } },
          },
        ]),
      },
      globalRiskClient: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const utils = new UtilsService();
    service = new CcpService(
      prisma as any,
      new CcpParserService(utils),
      new RiskScoringService(),
      utils,
      {} as any,
    );

    await (service as any).rebuildGlobalRiskClient('hash1', 'Setif');

    expect(prisma.globalRiskClient.create).toHaveBeenCalledTimes(1);
    const createArgs = prisma.globalRiskClient.create.mock.calls[0][0];
    expect(Number(createArgs.data.totalAttemptedAmount)).toBe(1200);
    expect(Number(createArgs.data.totalCollectedAmount)).toBe(1200);
    expect(Number(createArgs.data.totalFailedAmount)).toBe(0);
    expect(createArgs.data.failedLineCount).toBe(0);
    expect(createArgs.data.uniqueFailedReferences).toBe(0);
    expect(createArgs.data.failedMonthsCount).toBe(0);
    expect(createArgs.data.lastFailureDate).toBeNull();
    expect(createArgs.data.riskScore).toBe(0);
    expect(createArgs.data.riskLevel).toBe('FAIBLE');
  });

  it('should group payment failures by prelevement cycle from day 5 to day 4', async () => {
    const prisma = {
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            sessionId: 10,
            clientAccountHash: 'hash1',
            clientAccountMask: '******8367',
            clientName: 'M.AHMED',
            clientNameNorm: 'm ahmed',
            amount: 1200,
            operationDate: new Date('2025-06-30T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 1,
            cleanReference: 'FAHMED250601202',
            session: { lead: { wilaya: 'Setif' } },
          },
          {
            id: 2,
            sessionId: 10,
            clientAccountHash: 'hash1',
            clientAccountMask: '******8367',
            clientName: 'M.AHMED',
            clientNameNorm: 'm ahmed',
            amount: 1200,
            operationDate: new Date('2025-07-04T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 0,
            cleanReference: 'FAHMED250601202',
            session: { lead: { wilaya: 'Setif' } },
          },
        ]),
      },
      globalRiskClient: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const utils = new UtilsService();
    service = new CcpService(
      prisma as any,
      new CcpParserService(utils),
      new RiskScoringService(),
      utils,
      {} as any,
    );

    await (service as any).rebuildGlobalRiskClient('hash1', 'Setif');

    const createArgs = prisma.globalRiskClient.create.mock.calls[0][0];
    expect(Number(createArgs.data.totalFailedAmount)).toBe(0);
    expect(createArgs.data.failedMonthsCount).toBe(0);
    expect(createArgs.data.lastFailureDate).toBeNull();
  });

  it('should use the showroom payment cycle start day when rebuilding global risk', async () => {
    const prisma = {
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            sessionId: 10,
            clientAccountHash: 'hash1',
            clientAccountMask: '******8367',
            clientName: 'M.AHMED',
            clientNameNorm: 'm ahmed',
            amount: 1200,
            operationDate: new Date('2025-01-31T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 1,
            cleanReference: 'FAHMED250601202',
            session: {
              lead: { wilaya: 'Setif', paymentCycleStartDay: 17 },
            },
          },
          {
            id: 2,
            sessionId: 10,
            clientAccountHash: 'hash1',
            clientAccountMask: '******8367',
            clientName: 'M.AHMED',
            clientNameNorm: 'm ahmed',
            amount: 1200,
            operationDate: new Date('2025-02-16T00:00:00.000Z'),
            ccpAccount: '0021008367',
            code: 0,
            cleanReference: 'FAHMED250601202',
            session: {
              lead: { wilaya: 'Setif', paymentCycleStartDay: 17 },
            },
          },
        ]),
      },
      globalRiskClient: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const utils = new UtilsService();
    service = new CcpService(
      prisma as any,
      new CcpParserService(utils),
      new RiskScoringService(),
      utils,
      {} as any,
    );

    await (service as any).rebuildGlobalRiskClient('hash1', 'Setif');

    const createArgs = prisma.globalRiskClient.create.mock.calls[0][0];
    expect(Number(createArgs.data.totalFailedAmount)).toBe(0);
    expect(createArgs.data.failedMonthsCount).toBe(0);
    expect(createArgs.data.lastFailureDate).toBeNull();
  });

  it('should not double-count duplicate transaction events across repeated uploads', async () => {
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
      session: { lead: { wilaya: 'Setif', paymentCycleStartDay: 5 } },
    };
    const prisma = {
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            sessionId: 10,
            file: { id: 1, originalFilename: 'RESULT-21008367-WISAM.txt' },
            ...duplicateFailure,
          },
          {
            id: 2,
            sessionId: 11,
            file: { id: 2, originalFilename: 'RESULT-21008367-WISAM.txt' },
            ...duplicateFailure,
          },
        ]),
      },
      globalRiskClient: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const utils = new UtilsService();
    service = new CcpService(
      prisma as any,
      new CcpParserService(utils),
      new RiskScoringService(),
      utils,
      {} as any,
    );

    await (service as any).rebuildGlobalRiskClient('hash1', 'Setif');

    const createArgs = prisma.globalRiskClient.create.mock.calls[0][0];
    expect(createArgs.data.seenInSessions).toBe(2);
    expect(Number(createArgs.data.totalAttemptedAmount)).toBe(1200);
    expect(Number(createArgs.data.totalFailedAmount)).toBe(1200);
    expect(createArgs.data.failedLineCount).toBe(1);
    expect(createArgs.data.uniqueFailedReferences).toBe(1);
    expect(createArgs.data.failedMonthsCount).toBe(1);
  });

  it('should count repeated identical rows inside the same source file', async () => {
    const repeatedFailure = {
      clientAccountHash: 'hash1',
      clientAccountMask: '******8367',
      clientName: 'M.KERSAOUI BILAL',
      clientNameNorm: 'm kersaoui bilal',
      amount: 2400,
      operationDate: new Date('2025-06-05T00:00:00.000Z'),
      ccpAccount: '00210042',
      code: 1,
      cleanReference: 'PAHMED250607',
      file: { id: 1, originalFilename: 'RESULT-21008367-WISAM.txt' },
      session: { lead: { wilaya: 'Setif', paymentCycleStartDay: 5 } },
    };
    const prisma = {
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, sessionId: 10, ...repeatedFailure },
          { id: 2, sessionId: 10, ...repeatedFailure },
        ]),
      },
      globalRiskClient: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const utils = new UtilsService();
    service = new CcpService(
      prisma as any,
      new CcpParserService(utils),
      new RiskScoringService(),
      utils,
      {} as any,
    );

    await (service as any).rebuildGlobalRiskClient('hash1', 'Setif');

    const createArgs = prisma.globalRiskClient.create.mock.calls[0][0];
    expect(Number(createArgs.data.totalAttemptedAmount)).toBe(4800);
    expect(Number(createArgs.data.totalFailedAmount)).toBe(4800);
    expect(createArgs.data.failedLineCount).toBe(2);
    expect(createArgs.data.uniqueFailedReferences).toBe(1);
    expect(createArgs.data.failedMonthsCount).toBe(1);
  });

  it('should count repeated paid references inside the same source file', async () => {
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
      session: { lead: { wilaya: 'Setif', paymentCycleStartDay: 5 } },
    };
    const prisma = {
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          { id: 1, sessionId: 10, ...repeatedPaid },
          { id: 2, sessionId: 10, ...repeatedPaid },
        ]),
      },
      globalRiskClient: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const utils = new UtilsService();
    service = new CcpService(
      prisma as any,
      new CcpParserService(utils),
      new RiskScoringService(),
      utils,
      {} as any,
    );

    await (service as any).rebuildGlobalRiskClient('hash1', 'Setif');

    const createArgs = prisma.globalRiskClient.create.mock.calls[0][0];
    expect(Number(createArgs.data.totalAttemptedAmount)).toBe(4800);
    expect(Number(createArgs.data.totalCollectedAmount)).toBe(4800);
    expect(Number(createArgs.data.totalFailedAmount)).toBe(0);
    expect(createArgs.data.successLineCount).toBe(2);
  });

  it('should count duplicate paid references across repeated uploaded files', async () => {
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
      session: { lead: { wilaya: 'Setif', paymentCycleStartDay: 5 } },
    };
    const prisma = {
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            sessionId: 10,
            file: { id: 1, originalFilename: 'RESULT-21008367-WISAM.txt' },
            ...repeatedPaid,
          },
          {
            id: 2,
            sessionId: 11,
            file: { id: 2, originalFilename: 'RESULT-21008367-WISAM.txt' },
            ...repeatedPaid,
          },
        ]),
      },
      globalRiskClient: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const utils = new UtilsService();
    service = new CcpService(
      prisma as any,
      new CcpParserService(utils),
      new RiskScoringService(),
      utils,
      {} as any,
    );

    await (service as any).rebuildGlobalRiskClient('hash1', 'Setif');

    const createArgs = prisma.globalRiskClient.create.mock.calls[0][0];
    expect(Number(createArgs.data.totalAttemptedAmount)).toBe(4800);
    expect(Number(createArgs.data.totalCollectedAmount)).toBe(4800);
    expect(Number(createArgs.data.totalFailedAmount)).toBe(0);
    expect(createArgs.data.successLineCount).toBe(2);
  });

  it('should export global risk clients as admin xls', async () => {
    process.env.ADMIN_EXPORT_TOKEN = 'secret-admin-token';
    const prisma = {
      globalRiskClient: {
        findMany: jest.fn().mockResolvedValue([
          {
            clientAccountHash: 'hash1',
            lastClientName: 'M.MENAOUER ALI',
            lastClientAccountMask: '******5172',
            riskScore: 45,
            riskLevel: 'MOYEN',
            seenInSessions: 2,
            seenInWilayas: ['Alger', 'Oran'],
            totalAttemptedAmount: 7500,
            totalCollectedAmount: 5000,
            totalFailedAmount: 2500,
            successLineCount: 1,
            failedLineCount: 2,
            uniqueFailedReferences: 1,
            failedMonthsCount: 1,
            lastFailureDate: new Date('2026-03-20T00:00:00.000Z'),
            firstSeenAt: new Date('2026-03-01T00:00:00.000Z'),
            lastSeenAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        ]),
      },
      ccpLine: {
        findMany: jest.fn(),
      },
    };
    const utils = new UtilsService();
    service = new CcpService(
      prisma as any,
      new CcpParserService(utils),
      new RiskScoringService(),
      utils,
      {} as any,
    );

    const xls = await service.downloadGlobalRiskXls('secret-admin-token');

    expect(xls).toContain('<table>');
    expect(xls).toContain('Global Risk Clients');
    expect(xls).toContain('M.MENAOUER ALI');
    expect(xls).toContain('******5172');
    expect(xls).toContain('MOYEN');
    expect(prisma.ccpLine.findMany).not.toHaveBeenCalled();
  });

  it('should backfill missing global risk names from clean CCP lines in admin xls', async () => {
    process.env.ADMIN_EXPORT_TOKEN = 'secret-admin-token';
    const targetHash =
      '3258e9592723139487a4c522eeab6637b69642fbb062aee68487725a075a3a22';
    const prisma = {
      globalRiskClient: {
        findMany: jest.fn().mockResolvedValue([
          {
            clientAccountHash: targetHash,
            lastClientName: null,
            lastClientAccountMask: 'Null',
            riskScore: 72,
            riskLevel: 'ELEVE',
            seenInSessions: 3,
            seenInWilayas: ['Setif'],
            totalAttemptedAmount: 12000,
            totalCollectedAmount: 4000,
            totalFailedAmount: 8000,
            successLineCount: 1,
            failedLineCount: 4,
            uniqueFailedReferences: 2,
            failedMonthsCount: 2,
            lastFailureDate: new Date('2026-05-20T00:00:00.000Z'),
            firstSeenAt: new Date('2026-03-01T00:00:00.000Z'),
            lastSeenAt: new Date('2026-05-21T00:00:00.000Z'),
          },
        ]),
      },
      ccpLine: {
        findMany: jest.fn().mockResolvedValue([
          {
            clientAccountHash: targetHash,
            clientName: 'M.CLIENT CLEAN',
            clientAccountMask: '******3A22',
          },
        ]),
      },
    };
    const utils = new UtilsService();
    service = new CcpService(
      prisma as any,
      new CcpParserService(utils),
      new RiskScoringService(),
      utils,
      {} as any,
    );

    const xls = await service.downloadGlobalRiskXls('secret-admin-token');

    expect(prisma.ccpLine.findMany).toHaveBeenCalledWith({
      where: {
        clientAccountHash: { in: [targetHash] },
      },
      select: {
        clientAccountHash: true,
        clientName: true,
        clientAccountMask: true,
      },
      orderBy: [{ operationDate: 'desc' }, { id: 'desc' }],
    });
    expect(xls).toContain(targetHash);
    expect(xls).toContain('M.CLIENT CLEAN');
    expect(xls).toContain('******3A22');
  });

  it('should rebuild all global risk clients as admin', async () => {
    process.env.ADMIN_EXPORT_TOKEN = 'secret-admin-token';
    const prisma = {
      ccpLine: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { clientAccountHash: 'hash1' },
            { clientAccountHash: 'hash2' },
          ])
          .mockResolvedValue([
            {
              id: 1,
              sessionId: 10,
              clientAccountHash: 'hash1',
              clientAccountMask: '******8367',
              clientName: 'M.AHMED',
              clientNameNorm: 'm ahmed',
              amount: 1200,
              operationDate: new Date('2025-06-05T00:00:00.000Z'),
              ccpAccount: '0021008367',
              code: 1,
              cleanReference: 'FAHMED250601202',
              session: { lead: { wilaya: 'Setif', paymentCycleStartDay: 5 } },
            },
          ]),
      },
      globalRiskClient: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const utils = new UtilsService();
    service = new CcpService(
      prisma as any,
      new CcpParserService(utils),
      new RiskScoringService(),
      utils,
      {} as any,
    );

    const result = await service.rebuildGlobalRiskDataset('secret-admin-token');

    expect(prisma.ccpLine.findMany).toHaveBeenNthCalledWith(1, {
      select: { clientAccountHash: true },
      distinct: ['clientAccountHash'],
      orderBy: { clientAccountHash: 'asc' },
    });
    expect(result).toEqual({ rebuiltClients: 2 });
    expect(prisma.globalRiskClient.create).toHaveBeenCalledTimes(2);
  });
});
