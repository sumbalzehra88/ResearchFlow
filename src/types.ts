export enum ContentType {
  TEXT = "text",
  HEADING = "heading",
  TABLE = "table",
  CHART = "chart",
  FIGURE = "figure"
}

export interface Paper {
  id: string;
  title: string;
  filename: string;
  totalPages: number;
  uploadedAt: string;
  url?: string;
  doi?: string;
  citationResolved?: boolean;
  citations?: ResolvedCitation[];
}

export interface ResolvedCitation {
  id: string;
  title: string;
  authors: string;
  year?: number;
  venue?: string;
  openAccessUrl?: string;
  abstract?: string;
  ingested?: boolean;
  hopDepth: number;
  status: "resolved" | "pending" | "failed";
  citationKey?: string;
  retracted?: boolean;
}

export interface PaperChunk {
  id: string;
  paperId: string;
  page: number;
  contentType: ContentType;
  text: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  sources?: CitationSource[];
  complexity?: "plain" | "dense";
  jargon?: "as-is" | "hover" | "plain-language";
}

export interface CitationSource {
  paperId: string;
  paperTitle: string;
  page: number;
  contentType: ContentType;
  text: string;
  relevanceScore?: number;
}

export interface AuditTrailEntry {
  id: string;
  timestamp: string;
  type: "upload" | "chat" | "citation_resolve" | "fidelity_check" | "report_gen";
  description: string;
  metadata?: any;
}

export interface CitationFidelityResult {
  citationMarker: string; // e.g., "[Vaswani et al., 2017]" or "[1]"
  citedPaperId: string;
  citedPaperTitle: string;
  claimInPaper: string;
  status: "Supported" | "Partially supported" | "Unsupported" | "Unverifiable";
  justification: string;
  verifiedAt: string;
  divergence_type?: "overgeneralization" | "scope_drift" | "temporal_drift" | "causal_overreach" | "other";
  divergence_description?: string;
  retracted?: boolean;
}

export interface Report {
  id: string;
  title: string;
  prompt: string;
  templateType: "executive_summary" | "literature_review" | "methods_critique" | "full_report";
  content: string;
  createdAt: string;
  complexity: "plain" | "dense";
  jargon: "as-is" | "hover" | "plain-language";
  references: {
    citationKey: string;
    title: string;
    authors: string;
    year?: number;
    fidelity?: "Supported" | "Partially supported" | "Unsupported" | "Unverifiable";
    fidelityJustification?: string;
    divergence_type?: "overgeneralization" | "scope_drift" | "temporal_drift" | "causal_overreach" | "other";
    divergence_description?: string;
    retracted?: boolean;
  }[];
}

export interface Notebook {
  id: string;
  name: string;
  createdAt: string;
  papers: Paper[];
  chatHistory: ChatMessage[];
  auditTrail: AuditTrailEntry[];
  reports: Report[];
  fidelityResults?: CitationFidelityResult[];
}
