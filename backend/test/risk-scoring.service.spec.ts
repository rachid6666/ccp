import { Test, TestingModule } from '@nestjs/testing';
import { RiskScoringService } from '../src/ccp/risk-scoring.service';

describe('RiskScoringService', () => {
  let service: RiskScoringService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RiskScoringService],
    }).compile();

    service = module.get<RiskScoringService>(RiskScoringService);
  });

  it('should classify follow-up when failed amount > 0', () => {
    const client = {
      clientAccountHash: 'hash1',
      clientAccountMask: '****5172',
      clientName: 'Test Client',
      clientNameNorm: 'test client',
      totalAttemptedAmount: 10000,
      totalCollectedAmount: 5000,
      totalFailedAmount: 5000,
      successLineCount: 2,
      failedLineCount: 2,
      uniqueFailedReferences: 1,
      failedMonthsCount: 1,
      lastFailureDate: new Date(),
    };

    expect(service.classifyFollowUp(client)).toBe(true);
  });

  it('should NOT classify as risky when failed amount < 20000', () => {
    const client = {
      clientAccountHash: 'hash1',
      clientAccountMask: '****5172',
      clientName: 'Test Client',
      clientNameNorm: 'test client',
      totalAttemptedAmount: 10000,
      totalCollectedAmount: 8000,
      totalFailedAmount: 2000,
      successLineCount: 2,
      failedLineCount: 2,
      uniqueFailedReferences: 1,
      failedMonthsCount: 1,
      lastFailureDate: new Date(),
    };

    expect(service.classifyRisky(client)).toBe(false);
  });

  it('should classify as risky when failed amount >= 20000', () => {
    const client = {
      clientAccountHash: 'hash1',
      clientAccountMask: '****5172',
      clientName: 'Test Client',
      clientNameNorm: 'test client',
      totalAttemptedAmount: 100000,
      totalCollectedAmount: 70000,
      totalFailedAmount: 30000,
      successLineCount: 2,
      failedLineCount: 2,
      uniqueFailedReferences: 1,
      failedMonthsCount: 1,
      lastFailureDate: new Date(),
    };

    expect(service.classifyRisky(client)).toBe(true);
  });

  it('should classify as risky when uniqueFailedReferences >= 3', () => {
    const client = {
      clientAccountHash: 'hash1',
      clientAccountMask: '****5172',
      clientName: 'Test Client',
      clientNameNorm: 'test client',
      totalAttemptedAmount: 10000,
      totalCollectedAmount: 8000,
      totalFailedAmount: 2000,
      successLineCount: 2,
      failedLineCount: 2,
      uniqueFailedReferences: 3,
      failedMonthsCount: 1,
      lastFailureDate: new Date(),
    };

    expect(service.classifyRisky(client)).toBe(true);
  });

  it('should classify as risky when failedMonthsCount >= 2', () => {
    const client = {
      clientAccountHash: 'hash1',
      clientAccountMask: '****5172',
      clientName: 'Test Client',
      clientNameNorm: 'test client',
      totalAttemptedAmount: 10000,
      totalCollectedAmount: 8000,
      totalFailedAmount: 2000,
      successLineCount: 2,
      failedLineCount: 2,
      uniqueFailedReferences: 1,
      failedMonthsCount: 2,
      lastFailureDate: new Date(),
    };

    expect(service.classifyRisky(client)).toBe(true);
  });

  it('should classify as block candidate when failed amount >= 50000', () => {
    const client = {
      clientAccountHash: 'hash1',
      clientAccountMask: '****5172',
      clientName: 'Test Client',
      clientNameNorm: 'test client',
      totalAttemptedAmount: 100000,
      totalCollectedAmount: 30000,
      totalFailedAmount: 70000,
      successLineCount: 2,
      failedLineCount: 2,
      uniqueFailedReferences: 1,
      failedMonthsCount: 1,
      lastFailureDate: new Date(),
    };

    expect(service.classifyBlockCandidate(client)).toBe(true);
  });

  it('should classify as block candidate when collected = 0 and failed >= 20000', () => {
    const client = {
      clientAccountHash: 'hash1',
      clientAccountMask: '****5172',
      clientName: 'Test Client',
      clientNameNorm: 'test client',
      totalAttemptedAmount: 30000,
      totalCollectedAmount: 0,
      totalFailedAmount: 30000,
      successLineCount: 0,
      failedLineCount: 5,
      uniqueFailedReferences: 2,
      failedMonthsCount: 1,
      lastFailureDate: new Date(),
    };

    expect(service.classifyBlockCandidate(client)).toBe(true);
  });

  it('should NOT classify as risky just from line count', () => {
    // This test verifies that raw failedLineCount alone does NOT create block status
    const client = {
      clientAccountHash: 'hash1',
      clientAccountMask: '****5172',
      clientName: 'Test Client',
      clientNameNorm: 'test client',
      totalAttemptedAmount: 3000,
      totalCollectedAmount: 2500,
      totalFailedAmount: 500, // 5 lines at 100 DA each, but low amount
      successLineCount: 25,
      failedLineCount: 5, // 5 failed lines but low amount
      uniqueFailedReferences: 1,
      failedMonthsCount: 1,
      lastFailureDate: new Date(),
    };

    expect(service.classifyRisky(client)).toBe(false);
    expect(service.classifyBlockCandidate(client)).toBe(false);
  });

  it('should calculate risk score with bounds', () => {
    const client = {
      clientAccountHash: 'hash1',
      clientAccountMask: '****5172',
      clientName: 'Test Client',
      clientNameNorm: 'test client',
      totalAttemptedAmount: 100000,
      totalCollectedAmount: 30000,
      totalFailedAmount: 70000,
      successLineCount: 2,
      failedLineCount: 2,
      uniqueFailedReferences: 1,
      failedMonthsCount: 1,
      lastFailureDate: new Date(),
    };

    const result = service.calculateRiskScore(client);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.level).toMatch(/FAIBLE|MOYEN|ÉLEVÉ|CRITIQUE/);
  });

  it('should return a French risk level', () => {
    const client = {
      clientAccountHash: 'hash1',
      clientAccountMask: '****5172',
      clientName: 'Test Client',
      clientNameNorm: 'test client',
      totalAttemptedAmount: 100000,
      totalCollectedAmount: 85000,
      totalFailedAmount: 15000,
      successLineCount: 2,
      failedLineCount: 2,
      uniqueFailedReferences: 1,
      failedMonthsCount: 1,
      lastFailureDate: new Date(),
    };

    const result = service.calculateRiskScore(client);

    expect(['FAIBLE', 'MOYEN', 'ÉLEVÉ', 'CRITIQUE']).toContain(result.level);
  });
});
