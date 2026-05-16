import type { SystemMode } from '@/lib/types/agent';

// ─── Static product + tuning constants ─────────────────────────────────────
export const AIVORA_CONFIG = {
  product: {
    name: 'Aivora',
    tagline: 'Super-Intelligent Autonomous Multimodal AI OS',
    version: '0.2.0',
    developer: 'Fokrul Islam',
    github: 'https://github.com/fokrulislam/aivora',
  },

  ai: {
    embeddingModel: process.env.NEXT_PUBLIC_EMBEDDING_MODEL ?? 'Xenova/all-MiniLM-L6-v2',
    embeddingDimension: 384,
    chatBaseUrl: process.env.AI_CHAT_BASE_URL ?? '',
    chatModel: process.env.AI_CHAT_MODEL ?? 'gpt-4o-mini',
    maxContextTokens: 8192,
    maxQueryLength: 2000,
    maxAnswerTokens: 1024,
  },

  localLLM: {
    defaultModel:
      process.env.NEXT_PUBLIC_LOCAL_LLM_MODEL ?? 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    maxTokens: 512,
    temperature: 0.7,
  },

  retrieval: {
    defaultMatchCount: 8,
    similarityThreshold: 0.35,
    vectorWeight: 0.70,
    keywordWeight: 0.30,
    maxRetries: 1,
    weakContextThreshold: 0.45,
    conflictScoreGap: 0.05,
  },

  chunking: {
    defaultMaxTokens: 512,
    defaultOverlap: 64,
    minChunkLength: 100,
    avgCharsPerToken: 4,
  },

  ui: {
    colors: {
      cyan: '#22d3ee',
      electricBlue: '#38bdf8',
      violet: '#8b5cf6',
      deepBackground: '#020617',
      panelDark: 'rgba(15, 23, 42, 0.45)',
    },
  },
} as const;

export type AivoraConfig = typeof AIVORA_CONFIG;

// ─── Runtime config helpers ─────────────────────────────────────────────────
// These are called at request-time, never at module import time, so they
// always reflect the actual process environment (no stale build-time capture).

/**
 * True when the Supabase vector store is reachable from the server.
 * Requires the public URL, the public anon key, and the server-only service role key.
 * AI_CHAT_* absence is NOT a reason to return false here.
 */
export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * True when an optional external OpenAI-compatible LLM endpoint is configured.
 * Blank AI_CHAT_* values are intentional — they mean "use browser-local WebLLM".
 */
export function isExternalLLMConfigured(): boolean {
  return !!(process.env.AI_CHAT_BASE_URL && process.env.AI_CHAT_API_KEY);
}

/**
 * Server-side Supabase credentials (includes service role key — never send to browser).
 */
export function getServerAivoraConfig() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    llmBaseUrl: process.env.AI_CHAT_BASE_URL ?? '',
    llmApiKey: process.env.AI_CHAT_API_KEY ?? '',
    llmModel: process.env.AI_CHAT_MODEL ?? AIVORA_CONFIG.ai.chatModel,
  };
}

/**
 * Browser-safe Supabase config — only NEXT_PUBLIC_* values.
 */
export function getClientAivoraConfig() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    localLLMModel: process.env.NEXT_PUBLIC_LOCAL_LLM_MODEL ?? AIVORA_CONFIG.localLLM.defaultModel,
  };
}

/**
 * Determines the active system mode at runtime.
 *
 * "rag"          — Supabase + external server LLM both configured
 * "local-webllm" — Supabase configured, no external LLM (browser WebLLM handles generation)
 * "demo"         — Supabase not configured; UI shows Aivora OS Lite label
 */
export function getAivoraRuntimeMode(): SystemMode {
  if (!isSupabaseConfigured()) return 'demo';
  if (isExternalLLMConfigured()) return 'rag';
  return 'local-webllm';
}
