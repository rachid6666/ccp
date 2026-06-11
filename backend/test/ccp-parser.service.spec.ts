import { Test, TestingModule } from '@nestjs/testing';
import { CcpParserService } from '../src/ccp/ccp-parser.service';
import { UtilsService } from '../src/common/utils.service';

describe('CcpParserService', () => {
  let service: CcpParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CcpParserService, UtilsService],
    }).compile();

    service = module.get<CcpParserService>(CcpParserService);
  });

  it('should parse valid CCP line with code 0', () => {
    const line =
      '0000565172M.MENAOUER ALI             00000000786.6705/03/20260021008367000FMECHE251101705';
    const result = service.parseLine(line, 'test-salt');

    expect(result.isValid).toBe(true);
    expect(result.clientAccount).toBe('0000565172');
    expect(result.clientName).toBe('M.MENAOUER ALI');
    expect(result.amount).toBe(786.67);
    expect(result.code).toBe(0);
    expect(result.reference).toBe('FMECHE251101705');
  });

  it('should parse valid CCP line with code 1', () => {
    const line =
      '0001766185M.NAROUNE YOUCEF           00000000614.5805/01/20250021008367100AHMED241200104';
    const result = service.parseLine(line, 'test-salt');

    expect(result.isValid).toBe(true);
    expect(result.clientAccount).toBe('0001766185');
    expect(result.code).toBe(1);
    expect(result.amount).toBe(614.58);
  });

  it('should reject invalid line format', () => {
    const line = 'INVALID LINE FORMAT';
    const result = service.parseLine(line, 'test-salt');

    expect(result.isValid).toBe(false);
    expect(result.errorReason).toContain('does not match');
  });

  it('should reject empty line', () => {
    const line = '';
    const result = service.parseLine(line, 'test-salt');

    expect(result.isValid).toBe(false);
    expect(result.errorReason).toBe('Empty line');
  });

  it('should hash client account', () => {
    const line =
      '0000565172M.MENAOUER ALI             00000000786.6705/03/20260021008367000FMECHE251101705';
    const result = service.parseLine(line, 'test-salt');

    expect(result.clientAccountHash).toBeTruthy();
    expect(result.clientAccountHash.length).toBe(64); // SHA-256 hex length
  });

  it('should mask CCP account', () => {
    const line =
      '0000565172M.MENAOUER ALI             00000000786.6705/03/20260021008367000FMECHE251101705';
    const result = service.parseLine(line, 'test-salt');

    expect(result.clientAccountMask).toBe('******5172');
  });

  it('should parse multiple lines from file', () => {
    const content = `0000565172M.MENAOUER ALI             00000000786.6705/03/20260021008367000FMECHE251101705
0001766185M.NAROUNE YOUCEF           00000000614.5805/01/20250021008367000AHMED241200104
0002016874M.RADJA CHIKH              00000001640.0005/02/20250021008367000FMECHE250100301`;

    const results = service.parseFile(content, 'test-salt');

    expect(results.length).toBe(3);
    expect(results[0].isValid).toBe(true);
    expect(results[1].isValid).toBe(true);
    expect(results[2].isValid).toBe(true);
  });

  it('should classify code 0 as collected', () => {
    const line =
      '0000565172M.MENAOUER ALI             00000000786.6705/03/20260021008367000FMECHE251101705';
    const result = service.parseLine(line, 'test-salt');

    expect(result.code).toBe(0);
  });

  it('should classify code 1 as failed', () => {
    const line =
      '0001766185M.NAROUNE YOUCEF           00000000614.5805/01/20250021008367100AHMED241200104';
    const result = service.parseLine(line, 'test-salt');

    expect(result.code).toBe(1);
  });

  it('should parse amounts with two decimal places', () => {
    const line =
      '0000565172M.MENAOUER ALI             00000000786.6705/03/20260021008367000FMECHE251101705';
    const result = service.parseLine(line, 'test-salt');

    expect(result.amount).toBe(786.67);
  });
});
