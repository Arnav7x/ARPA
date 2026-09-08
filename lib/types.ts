export type StageName =
  | "ingest-literature"
  | "generate-proposal"
  | "design-methodology"
  | "generate-dataset"
  | "run-analysis"
  | "make-visualizations"
  | "draft-results"
  | "assemble-paper"
  | "peer-review"
  | "run-all";

export type HumanGateType = "select-question" | "approve-proposal" | "peer-review";

export type PipelineStatus = "idle" | "running" | "awaiting_human_gate" | "completed" | "error";

export interface CandidateResearchQuestion {
  label: string;
  question: string;
  feasibilityNote: string;
  sourcePapers: string[];
}

export interface HumanGateState {
  type: HumanGateType;
  pending: boolean;
  payload: Record<string, unknown>;
}

export interface PipelineState {
  status: PipelineStatus;
  currentStage?: StageName;
  completedStages: StageName[];
  humanGate?: HumanGateState;
  selectedQuestion?: {
    selectionType: "candidate" | "custom";
    label: string;
    question: string;
  };
  proposalApproved?: boolean;
  peerReview?: {
    commentsFile?: string;
    currentIndex?: number;
    total?: number;
  };
  lastUpdatedAt: string;
  lastError?: string;
}

export interface ProjectPaths {
  root: string;
  dataDir: string;
  rawPapersDir: string;
  outputsDir: string;
  analysisDir: string;
  figuresDir: string;
  intermediateDir: string;
  paperSectionsDir: string;
  gapMap: string;
  candidateQuestions: string;
  paperMetadata: string;
  selectedQuestion: string;
  proposal: string;
  proposalCritique: string;
  methodology: string;
  methodologyPlan: string;
  dataset: string;
  datasetProvenance: string;
  dataQualityReport: string;
  resultsDiscussion: string;
  adversarialReview: string;
  numberTraceReport: string;
  paperDraft: string;
  paperDocx: string;
  peerReviewLog: string;
  decisionLog: string;
  pipelineState: string;
  paperWordCountReport: string;
  commentsUpload: string;
  peerReviewResponses: string;
}

export interface StageRunOptions {
  overwrite?: boolean;
  style?: "apa" | "ieee";
  n?: number;
  publicDatasetPath?: string;
}
