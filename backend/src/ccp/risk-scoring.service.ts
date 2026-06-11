import { Injectable } from '@nestjs/common';

export interface RiskClientData {
  clientAccountHash: string;
  clientAccountMask: string;
  clientName: string;
  clientNameNorm: string;
  totalAttemptedAmount: number;
  totalCollectedAmount: number;
  totalFailedAmount: number;
  successLineCount: number;
  failedLineCount: number;
  uniqueFailedReferences: number;
  failedMonthsCount: number;
  lastFailureDate: Date | null;
}

export interface RiskScore {
  score: number;
  level: string; // FAIBLE, MOYEN, ÉLEVÉ, CRITIQUE
}

@Injectable()
export class RiskScoringService {
  calculateRiskScore(client: RiskClientData): RiskScore {
    let score = 0;

    // Base score from failed amount
    score += client.totalFailedAmount / 1000;

    // Failed months penalty
    score += client.failedMonthsCount * 15;

    // Recent failure penalty
    if (client.lastFailureDate) {
      const daysSinceFailure = this.daysSince(client.lastFailureDate);
      if (daysSinceFailure <= 30) {
        score += 15;
      } else if (daysSinceFailure <= 60) {
        score += 10;
      } else if (daysSinceFailure <= 90) {
        score += 5;
      }
    }

    // No success penalty
    if (client.totalCollectedAmount === 0 && client.totalFailedAmount >= 10000) {
      score += 20;
    }

    // Success mitigation
    score -= client.totalCollectedAmount / 5000;

    // Clamp score between 0 and 100
    score = Math.max(0, Math.min(100, score));

    const level = this.getRiskLevel(score);

    return { score: Math.round(score), level };
  }

  private getRiskLevel(score: number): string {
    if (score <= 30) return 'FAIBLE';
    if (score <= 60) return 'MOYEN';
    if (score <= 80) return 'ÉLEVÉ';
    return 'CRITIQUE';
  }

  private daysSince(date: Date): number {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  classifyFollowUp(client: RiskClientData): boolean {
    return client.totalFailedAmount > 0;
  }

  classifyRisky(client: RiskClientData): boolean {
    const failureRateByAmount =
      client.totalAttemptedAmount > 0
        ? (client.totalFailedAmount / client.totalAttemptedAmount) * 100
        : 0;

    return (
      client.totalFailedAmount >= 20000 ||
      client.failedMonthsCount > 3 ||
      (failureRateByAmount >= 60 && client.totalFailedAmount >= 10000)
    );
  }

  classifyBlockCandidate(client: RiskClientData): boolean {
    return (
      client.totalFailedAmount >= 50000 ||
      client.failedMonthsCount > 3 ||
      (client.totalCollectedAmount === 0 && client.totalFailedAmount >= 20000)
    );
  }
}
