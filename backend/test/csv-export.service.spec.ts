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
});
