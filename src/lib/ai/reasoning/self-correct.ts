import { callLLM } from '@/lib/ai/agents/agent-state';
import { buildQueryRewritePrompt } from '@/lib/ai/prompts/agent-loop';
import type { ReflectionResult } from './reflect';

export type CorrectionResult = {
  shouldRetry: boolean;
  rewrittenQuery: string;
  corrections: string[];
};

export async function selfCorrect(
  originalQuery: string,
  reflection: ReflectionResult
): Promise<CorrectionResult> {
  const corrections: string[] = [];

  if (reflection.isOutOfScope) {
    corrections.push('Query appears to be outside the knowledge base scope.');
  }

  if (reflection.weakContext) {
    corrections.push('Retrieved context is weak; retrying with a broader query.');

    const rewrittenQuery = await callLLM({
      system: 'You are a query rewriter. Output only the rewritten query, no explanation.',
      user: buildQueryRewritePrompt(originalQuery, reflection.reflection),
      maxTokens: 128,
      temperature: 0.3,
    });

    if (rewrittenQuery === '__DEMO_LLM_UNAVAILABLE__') {
      return { shouldRetry: false, rewrittenQuery: originalQuery, corrections };
    }

    return {
      shouldRetry: true,
      rewrittenQuery: rewrittenQuery.trim().replace(/^["']|["']$/g, ''),
      corrections,
    };
  }

  if (reflection.isConflicting) {
    corrections.push('Conflicting sources detected; both will be cited with uncertainty noted.');
  }

  if (!reflection.isRelevant) {
    corrections.push('Retrieved chunks may not be relevant; answer will note uncertainty.');
  }

  return {
    shouldRetry: false,
    rewrittenQuery: originalQuery,
    corrections,
  };
}
