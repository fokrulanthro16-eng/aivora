import type { SourceCitation } from './citation';

export type QueryClassification =
  | 'document_lookup'
  | 'policy_lookup'
  | 'faq_lookup'
  | 'technical_lookup'
  | 'general_question'
  | 'insufficient_context';

export type SystemMode = 'demo' | 'rag' | 'local-webllm' | 'error-safe';

export type ReasoningTrace = {
  plan: string[];
  retrievalSummary: string;
  reflection: string;
  corrections: string[];
};

export type AgentAnalytics = {
  confidence: number;
  citationCount: number;
  latencyMs: number;
  mode: SystemMode;
  messagesInSession: number;
  memoryCount: number;
};

export type AivoraAgentInput = {
  query: string;
  conversationId?: string;
  userId?: string;
  filters?: {
    tags?: string[];
    documentIds?: string[];
  };
};

export type AivoraAgentResponse = {
  answer: string;
  reasoningTrace: ReasoningTrace;
  citations: SourceCitation[];
  confidence: number;
  needsMoreContext: boolean;
  demoMode?: boolean;
  needsLocalLLM?: boolean;
  retrievedContext?: string;
};

export type AgentPhase = 'plan' | 'retrieve' | 'reflect' | 'self_correct' | 'respond' | 'idle' | 'error';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: SourceCitation[];
  reasoningTrace?: ReasoningTrace;
  confidence?: number;
  needsMoreContext?: boolean;
  demoMode?: boolean;
  needsLocalLLM?: boolean;
  systemMode?: SystemMode;
  timestamp: number;
};
