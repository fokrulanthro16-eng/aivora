import type { HybridSearchResult } from '@/lib/types/document';
import { callLLM } from '@/lib/ai/agents/agent-state';
import { REFLECTION_SYSTEM_PROMPT } from '@/lib/ai/prompts/system';
import { buildReflectionPrompt } from '@/lib/ai/prompts/agent-loop';

export type ReflectionResult = {
  isRelevant: boolean;
  isConflicting: boolean;
  isOutOfScope: boolean;
  weakContext: boolean;
  confidence: number;
  reflection: string;
};

export async function reflectOnRetrieval(
  query: string,
  chunks: HybridSearchResult[]
): Promise<ReflectionResult> {
  if (chunks.length === 0) {
    return {
      isRelevant: false,
      isConflicting: false,
      isOutOfScope: true,
      weakContext: true,
      confidence: 0.0,
      reflection: 'No chunks were retrieved. The knowledge base may not contain relevant information.',
    };
  }

  const response = await callLLM({
    system: REFLECTION_SYSTEM_PROMPT,
    user: buildReflectionPrompt(query, chunks),
    maxTokens: 256,
    temperature: 0.1,
  });

  // No external LLM configured — use score-based heuristics.
  // Chunks that passed the retrieval threshold are treated as relevant.
  if (response === '__DEMO_LLM_UNAVAILABLE__' || !response) {
    const topScore = chunks[0]?.hybrid_score ?? 0;
    return {
      isRelevant: true,
      isConflicting: false,
      isOutOfScope: false,
      weakContext: false,
      confidence: Math.max(topScore, 0.6),
      reflection: `Retrieved ${chunks.length} chunk(s) with top relevance ${topScore.toFixed(2)} — LLM quality assessment unavailable.`,
    };
  }

  try {
    const parsed = JSON.parse(response) as ReflectionResult;
    return {
      isRelevant: parsed.isRelevant ?? true,
      isConflicting: parsed.isConflicting ?? false,
      isOutOfScope: parsed.isOutOfScope ?? false,
      weakContext: parsed.weakContext ?? false,
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
      reflection: parsed.reflection ?? 'Retrieval appears adequate.',
    };
  } catch {
    const topScore = chunks[0]?.hybrid_score ?? 0;
    return {
      isRelevant: chunks.length > 0,
      isConflicting: false,
      isOutOfScope: false,
      weakContext: topScore < 0.4,
      confidence: Math.max(topScore, 0.55),
      reflection: 'Reflection parse failed; using score-based assessment.',
    };
  }
}
