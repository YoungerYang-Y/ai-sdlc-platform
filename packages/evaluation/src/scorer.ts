export interface DimensionScores {
  success: number;
  efficiency: number;
  cost: number;
}

export const WEIGHT_SNAPSHOT: Record<keyof DimensionScores, number> = {
  success: 0.5,
  efficiency: 0.3,
  cost: 0.2,
};

export interface ScorerConfig {
  efficiencyBaselineMs?: number;
  efficiencyMaxMs?: number;
  costBaselineTokens?: number;
  costMaxTokens?: number;
}

export function computeRuleScores(summary: Record<string, unknown> | null, config: ScorerConfig = {}): DimensionScores {
  if (!summary) return { success: 0, efficiency: 0.5, cost: 0.5 };

  const success = summary.final_status === "completed" ? 1.0 : 0.0;

  const effBaseline = config.efficiencyBaselineMs ?? 600000;
  const effMax = config.efficiencyMaxMs ?? 3600000;
  const durationMs = Number(summary.duration_ms ?? effBaseline);
  const efficiency = Math.max(0, Math.min(1, 1 - (durationMs - effBaseline) / (effMax - effBaseline)));

  const costBaseline = config.costBaselineTokens ?? 1000;
  const costMax = config.costMaxTokens ?? 100000;
  const tokenTotals = summary.token_totals as { total?: number } | null;
  const tokens = tokenTotals?.total ?? 10000;
  const cost = Math.max(0, Math.min(1, 1 - (tokens - costBaseline) / (costMax - costBaseline)));

  return { success, efficiency, cost };
}
