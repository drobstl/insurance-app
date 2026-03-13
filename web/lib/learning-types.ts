import 'server-only';

export type ConversationType =
  | 'referral'
  | 'conservation'
  | 'policy-review'
  | 'fif-reset';

export type ConversationOutcome = 'success' | 'failure' | 'neutral';

export type ClientPersona =
  | 'eager'
  | 'curious'
  | 'skeptical'
  | 'avoidant'
  | 'analytical'
  | 'emotional'
  | 'hostile'
  | 'unknown';

export interface TurningPoint {
  exchangeNumber: number;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
}

export interface ConversationAnalysis {
  conversationType: ConversationType;
  outcome: ConversationOutcome;
  clientPersona: ClientPersona;

  outcomeScore: number;
  voiceComplianceScore: number;
  strategyExecutionScore: number;

  effectiveTechniques: string[];
  ineffectiveTechniques: string[];
  turningPoints: TurningPoint[];

  whatWorked: string;
  whatFailed: string;
  lessonsLearned: string[];
  suggestedImprovements: string[];

  exchangeCount: number;
  exchangeCountAtSuccess: number | null;
  successTrigger: string | null;
}

export interface ConversationMessage {
  role: string;
  body: string;
  timestamp: string;
}

export interface AnalysisMetadata {
  messageCount: number;
  durationMinutes: number | null;
  reason: string | null;
  premiumAmount: number | null;
  coverageAmount: number | null;
  carrier: string | null;
  policyType: string | null;
  [key: string]: unknown;
}

export interface StoredAnalysis {
  id: string;
  agentId: string;
  conversationType: ConversationType;
  outcome: ConversationOutcome;
  clientPersona: ClientPersona;

  analysis: ConversationAnalysis;
  conversation: ConversationMessage[];
  metadata: AnalysisMetadata;

  sourceDocPath: string;
  sourceDocId: string;

  isSynthetic: boolean;
  syntheticSourceId: string | null;

  experimentId: string | null;
  experimentArm: 'control' | 'variant' | null;
  strategyVersion: number;

  createdAt: string;
  conversationEndedAt: string;
}

export interface CounterfactualAnnotation {
  exchangeNumber: number;
  originalMessage: string;
  rewrittenMessage: string;
  reasoning: string;
}

export interface CounterfactualResult {
  originalConversation: ConversationMessage[];
  rewrittenConversation: ConversationMessage[];
  annotations: CounterfactualAnnotation[];
}

export interface PersonaClassification {
  persona: ClientPersona;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}

export interface CriticScores {
  voiceFidelity: number;
  strategicAlignment: number;
  brevity: boolean;
  goalAdvancement: number;
  antiPatternViolation: boolean;
}

export interface CriticResult {
  approved: boolean;
  scores: CriticScores;
  compositeScore: number;
  feedback: string | null;
  flaggedIssues: string[];
}

export interface StrategyRecord {
  conversationType: ConversationType;
  currentVersion: number;
  strategyDocument: string;
  antiPatterns: string;
  personaStrategies: Partial<Record<ClientPersona, string>>;
  topExemplarIds: string[];
  topExemplarsByPersona: Partial<Record<ClientPersona, string[]>>;
  conversationsAnalyzed: number;
  successRate: number;
  previousSuccessRate: number;
  updatedAt: string;
}

export interface StrategyVersion {
  version: number;
  strategyDocument: string;
  antiPatterns: string;
  personaStrategies: Partial<Record<ClientPersona, string>>;
  topExemplarIds: string[];
  topExemplarsByPersona: Partial<Record<ClientPersona, string[]>>;
  conversationsAnalyzed: number;
  successRate: number;
  promotedAt: string;
  rolledBackAt: string | null;
  rolledBackReason: string | null;
  replacedByVersion: number | null;
  sourceExperimentId: string | null;
}

export type ExperimentStatus =
  | 'running'
  | 'winner-control'
  | 'winner-variant'
  | 'inconclusive';

export interface Experiment {
  id: string;
  conversationType: ConversationType;
  hypothesis: string;
  changeDescription: string;
  controlStrategyVersion: number;
  variantStrategyVersion: number;
  status: ExperimentStatus;
  controlConversations: number;
  controlSuccesses: number;
  variantConversations: number;
  variantSuccesses: number;
  pValue: number | null;
  confidenceInterval: [number, number] | null;
  minimumSampleSize: number;
  startedAt: string;
  resolvedAt: string | null;
  resolvedReason: string | null;
}

export interface PerformanceSnapshot {
  id: string;
  conversationType: ConversationType;
  strategyVersion: number;
  period: '7d' | '30d';
  conversationsCompleted: number;
  successes: number;
  failures: number;
  successRate: number;
  baselineVersion: number;
  baselineSuccessRate: number;
  delta: number;
  isRegression: boolean;
  rollbackTriggered: boolean;
  timestamp: string;
}

export interface RollbackRecord {
  id: string;
  conversationType: ConversationType;
  rolledBackVersion: number;
  restoredVersion: number;
  trigger: 'regression' | 'manual';
  evidence: {
    currentSuccessRate: number;
    baselineSuccessRate: number;
    delta: number;
    pValue: number;
    sampleSize: number;
  };
  timestamp: string;
}
