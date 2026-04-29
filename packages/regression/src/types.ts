// ============================================================================
// Shared types for the 3-layer regression suite.
// A "case" is one curated conversation from the 100-set; a "result" is the
// AI's reply plus all 3 layers' verdicts.
// ============================================================================

export type RegressionCase = {
  id: string;
  sedeId: string;
  sedeName: string;
  // Last message FROM the client. The suite asks the AI to respond to this
  // given the prior history below.
  clientMessage: string;
  // Conversation up to (but not including) the clientMessage above.
  history: { sender: "cliente" | "ai" | "agente_humano"; content: string; agente?: string }[];
  // Optional ground-truth criteria for deterministic + judge layers.
  expected: {
    // Phrases that MUST appear (regex). e.g. price in correct currency.
    mustInclude?: RegExp[];
    // Phrases the response MUST NOT contain. e.g. competitor sede names.
    mustExclude?: RegExp[];
    // Free-form rúbrica notes shown to the LLM judge.
    judgeNotes?: string;
    // Outcome label: closed_OW, closed_AOW, lost, follow_up, etc.
    outcome?: string;
  };
  // Optional metadata used to filter the run.
  tags?: string[];
};

export type DeterministicVerdict = {
  passed: boolean;
  failures: { rule: string; detail: string }[];
};

export type JudgeScores = {
  tone: number; // 1-5
  accuracy: number;
  relevance: number;
  antiHallucination: number;
  effectiveness: number;
  overall: number; // 1-5 weighted
  explanation: string;
  confidence: number; // 0-1
};

export type CaseResult = {
  caseId: string;
  generatedResponse: string;
  latencyMs: number;
  costUsd: number;
  cacheHitRate: number;
  deterministic: DeterministicVerdict;
  judge: JudgeScores | null;
  needsHumanReview: boolean;
  reviewReason: string | null;
};

export type SuiteResult = {
  promptVersionId: string;
  startedAt: string;
  finishedAt: string;
  totalCases: number;
  results: CaseResult[];
  passRate: number; // determined by both layers
  averageScores: Omit<JudgeScores, "explanation" | "confidence">;
  totalCostUsd: number;
  averageLatencyMs: number;
  reviewQueueSize: number;
};

export type SuiteDiff = {
  before: SuiteResult;
  after: SuiteResult;
  scoreDeltas: Record<keyof Omit<JudgeScores, "explanation" | "confidence">, number>;
  newRegressions: string[]; // case ids that passed before, fail now
  newFixes: string[]; // case ids that failed before, pass now
};
