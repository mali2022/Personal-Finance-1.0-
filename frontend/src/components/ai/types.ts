export interface AiAnalysisReport {
  schemaVersion: 1;
  reportTitle: string;
  reportType: string;
  reportingPeriod: string;
  generatedAt: string;
  dataAsOf: string | null;
  currency: string;
  executiveSummary: string;
  keyMetrics: { key: string; label: string; value: string; currency: string; evidenceId: string }[];
  insights: AiFinding[];
  anomalies: AiFinding[];
  recommendations: AiFinding[];
  categoryBreakdown: { id: string; label: string; amount: string; evidenceId: string }[];
  trendSeries: { label: string; income: string; expense: string }[];
  confidence: string;
  limitations: string[];
  followUpActions: { label: string; prompt: string }[];
}
export interface AiFinding { title: string; text: string; status: string; evidenceIds: string[]; followUp?: string; priority?: string }
