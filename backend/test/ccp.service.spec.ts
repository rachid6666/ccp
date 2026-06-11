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
});
