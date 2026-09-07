/** Presentation-only KPI rules. Missing scores never imply poor performance. */
export function weightedPerformanceScore(scores: readonly number[], weights: readonly number[]): number {
  if (scores.length !== weights.length || !scores.length || scores.some(value => !Number.isFinite(value) || value < 1 || value > 5)) return 0;
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  return totalWeight > 0 ? scores.reduce((sum, value, index) => sum + value * weights[index], 0) / totalWeight : 0;
}
export const performanceScoreText = (score: number) => Number.isFinite(score) && score >= 1 && score <= 5 ? score.toFixed(1) : "—";
export function canSubmitPerformanceScores(scores: readonly number[], evidence: readonly string[], areaCount: number) {
  return scores.length === areaCount && scores.every((score, index) => Number.isInteger(score) && score >= 1 && score <= 5 && (![1, 2, 5].includes(score) || Boolean(evidence[index]?.trim())));
}
export function performanceDate(value: string, language: "TH" | "EN" | "JP", includeYear = true) {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(language === "TH" ? "th-TH" : language === "JP" ? "ja-JP" : "en-GB", {day:"numeric",month:"short",...(includeYear ? {year:"numeric" as const} : {}),timeZone:"Asia/Bangkok"}).format(date);
}
