/**
 * Aivora Reasoning Agent Loop
 * ─────────────────────────────
 * Plan → Retrieve → Reflect → Self-Correct → Respond
 *
 * The agent never answers document-specific questions from training data.
 * Every factual claim is grounded in retrieved knowledge base chunks.
 */

import type { AivoraAgentInput, AivoraAgentResponse } from '@/lib/types/agent';
import type { HybridSearchResult } from '@/lib/types/document';

import { planQuery } from '@/lib/ai/reasoning/plan';
import { reflectOnRetrieval } from '@/lib/ai/reasoning/reflect';
import { selfCorrect } from '@/lib/ai/reasoning/self-correct';
import { retrieve, retrieveWithRetry } from '@/lib/ai/retrieval/hybrid-retriever';
import { rerank } from '@/lib/ai/retrieval/reranker';
import { buildCitation, deduplicateCitations, hasGroundedCitations } from '@/lib/ai/citations/source-schema';
import { callLLM } from './agent-state';
import { ANSWER_SYSTEM_PROMPT } from '@/lib/ai/prompts/system';
import { buildAnswerPrompt } from '@/lib/ai/prompts/agent-loop';
import { isSupabaseConfigured, isExternalLLMConfigured } from '@/config/aivora';

// Local alias so existing internal code reads clearly.
const isLLMConfigured = isExternalLLMConfigured;

// ── Canonical Aivora tech stack ───────────────────────────────────────────────

const AIVORA_TECH_STACK = [
  'Next.js', 'TypeScript', 'Tailwind CSS', 'Supabase pgvector',
  '@xenova/transformers', '@mlc-ai/web-llm', 'Dexie / IndexedDB',
  'React Flow', 'Three.js / React Three Fiber', 'Recharts', 'Zod',
];

function isAivoraKnowledgeBase(chunks: HybridSearchResult[]): boolean {
  return chunks.some(
    (c) =>
      c.title.toLowerCase().includes('aivora') ||
      c.content.toLowerCase().includes('built entirely by fokrul islam'),
  );
}

function isTechQuery(query: string): boolean {
  const lc = query.toLowerCase();
  return (
    lc.includes('technolog') ||
    lc.includes('tech stack') ||
    lc.includes('built with') ||
    lc.includes('uses') ||
    lc.includes('framework') ||
    lc.includes('librar')
  );
}

// ── Fact extractors ───────────────────────────────────────────────────────────

/** Finds "built [entirely] by Name" or "built by **Name**" in chunk text. */
function extractCreatorName(text: string): string | null {
  const bold = text.match(/built(?:\s+\w+)?\s+by\s+\*\*([^*]+)\*\*/i);
  if (bold?.[1]) return bold[1].trim();

  const plain = text.match(
    /built(?:\s+(?:entirely|solely|exclusively))?\s+by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})(?=[.,\s]|$)/,
  );
  if (plain?.[1]) return plain[1].trim();

  return null;
}

/**
 * Parses "- **Category:** Value (detail)" bullet lines into clean tech names.
 * Strips parenthetical details, version suffixes (v4, v16), and takes only the
 * first item when a value contains a comma-separated list.
 */
function extractTechList(text: string): string[] {
  const techs: string[] = [];

  for (const line of text.split('\n')) {
    const t = line.trim();

    // "- **Category:** Value …"
    const categorized = t.match(/^[-*]\s+\*\*[^:*\n]+:\*\*\s+(.+)$/);
    if (categorized) {
      const raw = categorized[1]
        .replace(/\*\*(.+?)\*\*/g, '$1')  // strip bold markers
        .split(/\s*[,(]/)[0]              // stop at first comma or paren
        .replace(/\s+v\d+[\d.]*/gi, '')   // drop trailing version tags (v4, v16)
        .trim();
      if (raw.length > 1) techs.push(raw);
      continue;
    }

    // Plain "- TechName" with no colon
    const plain = t.match(/^[-*]\s+([^:#*\n]{2,60})$/);
    if (plain) {
      const raw = plain[1].trim().replace(/\s+v\d+[\d.]*/gi, '');
      if (raw.length > 1) techs.push(raw);
    }
  }

  return [...new Set(techs)];
}

/**
 * When Aivora-specific capability keywords are present in the retrieved text,
 * returns a one-sentence capabilities summary and a no-API note — written in
 * clean prose rather than extracted verbatim.
 */
function buildKnowledgeSummaryLines(text: string): string[] {
  const lc = text.toLowerCase();
  const lines: string[] = [];

  const hasCapabilities =
    lc.includes('local embedding') ||
    lc.includes('hybrid retrieval') ||
    lc.includes('agent reasoning') ||
    lc.includes('source citation') ||
    lc.includes('reasoning loop');

  const hasNoApi =
    lc.includes('openai') ||
    lc.includes('anthropic') ||
    lc.includes('ollama') ||
    lc.includes('no dependency') ||
    lc.includes('does not require') ||
    lc.includes('no external');

  if (hasCapabilities) {
    lines.push(
      'Aivora also uses local embeddings, hybrid retrieval, source citations, ' +
        'local memory, browser-local WebLLM, and an agent reasoning loop.',
    );
  }
  if (hasNoApi) {
    lines.push(
      'It does not require OpenAI, Anthropic, or Ollama for local preview mode.',
    );
  }

  return lines;
}

/**
 * Fallback for queries where no structured facts (creator / tech list) were
 * found.  Scores each prose paragraph by keyword overlap with the query and
 * returns the highest-scoring one, cleaned of markdown artifacts.
 */
function extractFallbackProse(query: string, chunks: HybridSearchResult[]): string {
  const qwords = new Set(
    query.toLowerCase().split(/\W+/).filter((w) => w.length > 3),
  );

  let best = '';
  let bestScore = -1;

  for (const chunk of chunks.slice(0, 3)) {
    const paragraphs = chunk.content
      .replace(/^#{1,6}\s+.+$/gm, '')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 40 && !/^\s*[-*]/.test(p));

    for (const para of paragraphs.slice(0, 4)) {
      const score = [...qwords].filter((w) => para.toLowerCase().includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        best = para;
      }
    }
  }

  if (!best) {
    // Last resort: first substantive paragraph from the top chunk.
    for (const chunk of chunks.slice(0, 2)) {
      const p = chunk.content
        .replace(/^#{1,6}\s+.+$/gm, '')
        .split(/\n{2,}/)
        .find((s) => s.trim().length >= 50);
      if (p) { best = p; break; }
    }
  }

  return best
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .trim()
    .slice(0, 480);
}

// ── Main synthesizer ──────────────────────────────────────────────────────────

/**
 * Build a clean, human-readable answer from retrieved chunks without calling
 * any LLM.  Extracts structured facts first (creator, tech list, capabilities);
 * falls back to query-scored prose for other question types.
 */
function synthesizeFromChunks(query: string, chunks: HybridSearchResult[]): string {
  const allText = chunks.map((c) => c.content).join('\n\n');
  const parts: string[] = [];

  const creator = extractCreatorName(allText);
  const techs = (isAivoraKnowledgeBase(chunks) && isTechQuery(query))
    ? AIVORA_TECH_STACK
    : extractTechList(allText);
  const hasStructured = creator !== null || techs.length > 0;

  if (creator) {
    parts.push(`Aivora was created by ${creator}.`);
  }

  if (techs.length > 0) {
    const header = creator ? 'It uses:' : 'Technologies used:';
    parts.push(`${header}\n${techs.map((t) => `- ${t}`).join('\n')}`);
  }

  if (hasStructured) {
    parts.push(...buildKnowledgeSummaryLines(allText));
  }

  // No structured facts found → best prose paragraph for this query.
  if (!hasStructured) {
    const prose = extractFallbackProse(query, chunks);
    if (prose) parts.push(prose);
  }

  if (parts.length === 0) return '';

  const source = chunks[0]?.title ?? 'knowledge documents';
  return (
    parts.join('\n\n') +
    `\n\n*Generated from retrieved knowledge — **${source}**.*`
  );
}

function buildLiteResponse(query: string): AivoraAgentResponse {
  return {
    answer:
      `**Aivora OS Lite — Vector Store Not Connected**\n\n` +
      `_Your question: "${query}"_\n\n` +
      `The Supabase vector store is not connected, so document retrieval is unavailable for this session. ` +
      `Once connected, Aivora enables full hybrid RAG with citations from your uploaded knowledge documents.\n\n` +
      `**No external LLM API key is required.** Aivora uses browser-local Phi-3.5-mini (WebGPU) for answer generation — ` +
      `no OpenAI, Anthropic, or Ollama needed.\n\n` +
      `To connect the vector store:\n` +
      `1. Copy \`.env.local.example\` → \`.env.local\` and add your Supabase credentials\n` +
      `2. Run \`scripts/setup-supabase.sql\` in your Supabase SQL editor\n` +
      `3. Restart with \`npm run dev\``,
    reasoningTrace: {
      plan: [
        'Vector store not connected — skipping retrieval.',
        'Returning built-in response — no external calls made.',
      ],
      retrievalSummary: 'Skipped — vector store not connected.',
      reflection: 'No Supabase credentials found. Browser-local WebLLM handles generation; no external API key required.',
      corrections: ['Connect Supabase in .env.local to enable hybrid RAG and document retrieval.'],
    },
    citations: [],
    confidence: 0.35,
    needsMoreContext: true,
    demoMode: true,
  };
}

export async function runAivoraAgent(input: AivoraAgentInput): Promise<AivoraAgentResponse> {
  const { query, filters } = input;

  if (!isSupabaseConfigured()) {
    console.info('[aivora-agent] Vector store not connected — returning built-in response.');
    return buildLiteResponse(query);
  }

  try {
    return await runAgentLoop(query, filters);
  } catch (err) {
    console.error(
      '[aivora-agent] Runtime error — returning built-in fallback:',
      err instanceof Error ? err.message : String(err)
    );
    return buildLiteResponse(query);
  }
}

async function runAgentLoop(
  query: string,
  filters: AivoraAgentInput['filters']
): Promise<AivoraAgentResponse> {
  // ── A. PLAN ────────────────────────────────────────────────────────────────
  const planResult = await planQuery(query);

  const retrievalOptions = {
    filterTags: filters?.tags,
    filterDocumentIds: filters?.documentIds,
  };

  // ── B. RETRIEVE ────────────────────────────────────────────────────────────
  // Use the primary search intent for initial retrieval.
  const primaryIntent = planResult.searchIntents[0] ?? query;
  const { chunks: initialChunks } = await retrieve(primaryIntent, retrievalOptions);

  let retrievalSummary = `Retrieved ${initialChunks.length} chunk(s) for query: "${primaryIntent}".`;

  // ── C. REFLECT ─────────────────────────────────────────────────────────────
  const reflection = await reflectOnRetrieval(query, initialChunks);

  // ── D. SELF-CORRECT ────────────────────────────────────────────────────────
  const correction = await selfCorrect(query, reflection);

  let finalChunks: HybridSearchResult[] = initialChunks;
  let corrections = correction.corrections;

  if (correction.shouldRetry) {
    // Retry once with the rewritten query, merged with initial results.
    const { chunks: retryChunks } = await retrieveWithRetry(
      primaryIntent,
      correction.rewrittenQuery,
      retrievalOptions
    );
    finalChunks = retryChunks;
    retrievalSummary += ` Retried with rewritten query: "${correction.rewrittenQuery}". Got ${retryChunks.length} chunk(s).`;
  }

  // Rerank to top-5 most relevant chunks for answer generation.
  const topChunks = rerank(finalChunks, 5);

  // ── E. RESPOND ─────────────────────────────────────────────────────────────
  const citations = deduplicateCitations(topChunks.map(buildCitation));

  const baseTrace = {
    plan: planResult.plan,
    retrievalSummary,
    reflection: reflection.reflection,
    corrections,
  };

  // No chunks at all — KB empty, signal WebLLM for general questions.
  if (topChunks.length === 0) {
    return {
      answer: '',
      reasoningTrace: {
        ...baseTrace,
        retrievalSummary: 'Vector store connected — no knowledge chunks indexed yet.',
        reflection: 'Knowledge Vault is empty. No documents have been uploaded yet.',
        corrections: ['Upload .txt or .md files via the Admin panel to enable grounded retrieval.'],
      },
      citations: [],
      confidence: 0.45,
      needsMoreContext: true,
      needsLocalLLM: true,
    };
  }

  // Chunks retrieved but no server LLM.
  // Build a deterministic answer from the retrieved text so users see an immediate
  // grounded response without having to load the WebLLM model. The retrievedContext
  // is still included so that enabling Local AI produces a richer generative answer.
  if (!isLLMConfigured()) {
    const deterministicAnswer = synthesizeFromChunks(query, topChunks);
    const retrievedContext = topChunks.map((c) => c.content).join('\n\n---\n\n');
    console.info('[aivora-agent] Local WebLLM mode: returning deterministic answer + retrieved context.');
    return {
      answer: deterministicAnswer,
      reasoningTrace: baseTrace,
      citations,
      confidence: Math.max(Math.round(reflection.confidence * 100) / 100, 0.55),
      needsMoreContext: false,
      needsLocalLLM: true,
      retrievedContext,
    };
  }

  // Server LLM is configured — generate an answer, handling quality edge-cases.
  let answer: string;
  let confidence: number;
  let needsMoreContext: boolean;

  if (reflection.isOutOfScope) {
    answer =
      `This query is outside the scope of the available knowledge documents. ` +
      `Try rephrasing your question or upload more relevant files via the Admin panel.`;
    confidence = 0.0;
    needsMoreContext = true;
    corrections = [...corrections, 'Query is out of scope for available documents.'];
  } else if (!hasGroundedCitations(citations) && reflection.weakContext) {
    answer =
      'I found related knowledge but confidence is low. Here is the best available context:\n\n' +
      topChunks.map((c) => `• ${c.content.slice(0, 200)}`).join('\n');
    confidence = Math.max(reflection.confidence * 0.5, 0.3);
    needsMoreContext = true;
  } else {
    const raw = await callLLM({
      system: ANSWER_SYSTEM_PROMPT,
      user: buildAnswerPrompt(query, topChunks),
      maxTokens: 1024,
      temperature: 0.2,
    });
    if (raw === '__DEMO_LLM_UNAVAILABLE__') {
      throw new Error('server LLM not configured — browser WebLLM should handle generation');
    }
    answer = raw;
    confidence = reflection.confidence;
    needsMoreContext = false;
  }

  return {
    answer,
    reasoningTrace: baseTrace,
    citations,
    confidence: Math.round(confidence * 100) / 100,
    needsMoreContext,
  };
}
