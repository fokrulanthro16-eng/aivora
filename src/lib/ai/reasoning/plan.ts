import type { QueryClassification } from '@/lib/types/agent';
import { callLLM } from '@/lib/ai/agents/agent-state';
import { PLANNING_SYSTEM_PROMPT } from '@/lib/ai/prompts/system';
import { buildPlanningPrompt } from '@/lib/ai/prompts/agent-loop';

export type PlanResult = {
  searchIntents: string[];
  classification: QueryClassification;
  plan: string[];
};

export async function planQuery(query: string): Promise<PlanResult> {
  const response = await callLLM({
    system: PLANNING_SYSTEM_PROMPT,
    user: buildPlanningPrompt(query),
    maxTokens: 512,
    temperature: 0.1,
  });

  try {
    const parsed = JSON.parse(response) as PlanResult;
    return {
      searchIntents: parsed.searchIntents ?? [query],
      classification: parsed.classification ?? 'general_question',
      plan: parsed.plan ?? [`Search knowledge base for: ${query}`],
    };
  } catch {
    // Graceful fallback if LLM returns malformed JSON.
    return {
      searchIntents: [query],
      classification: 'general_question',
      plan: [`Search knowledge base for: ${query}`],
    };
  }
}
