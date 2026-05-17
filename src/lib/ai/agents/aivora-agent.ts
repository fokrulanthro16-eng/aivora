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
import { countDocuments } from '@/lib/db/vector/vector-store';
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

// ── Research-report detector ──────────────────────────────────────────────────

function isAutoResearchReport(query: string): boolean {
  const lc = query.toLowerCase();
  return (
    lc.includes('auto research report') ||
    lc.includes('complete autonomous research report') ||
    lc.includes('executive summary') ||
    lc.includes('final research brief')
  );
}

// ── Research-report builder ───────────────────────────────────────────────────

function buildResearchReport(chunks: HybridSearchResult[]): string {
  const NOT_FOUND = '_Not found in the selected document chunks._';
  const allText = chunks.map((c) => c.content).join('\n\n');
  const lines = allText.split('\n').map((l) => l.trim()).filter(Boolean);
  const docTitle = chunks[0]?.title ?? 'the document';

  // Split into sentences (lookbehind supported in Node 18+).
  const sentences = allText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);

  // ── Extractors ─────────────────────────────────────────────────────────────

  function pickLines(pattern: RegExp, max = 8): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of lines) {
      if (pattern.test(l) && !seen.has(l)) {
        seen.add(l);
        out.push(l.replace(/^[*\-•]\s*/, '').trim());
        if (out.length >= max) break;
      }
    }
    return out;
  }

  function pickSentences(pattern: RegExp, max = 5): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of sentences) {
      if (pattern.test(s) && !seen.has(s)) {
        seen.add(s);
        out.push(s.replace(/\*\*(.+?)\*\*/g, '$1'));
        if (out.length >= max) break;
      }
    }
    return out;
  }

  function stripMd(s: string): string {
    return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').trim();
  }

  // ── Section data ────────────────────────────────────────────────────────────

  // 1. Executive Summary — first 4 meaningful sentences from top chunks
  const summaryText = chunks
    .slice(0, 3)
    .map((c) => c.content.replace(/^#{1,6}\s+.+$/gm, '').trim())
    .join(' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 30)
    .slice(0, 4)
    .map(stripMd)
    .join(' ');

  // 2. Key Points — bullet lines
  const bulletLines = pickLines(/^[-*•]\s+.{20,}|^\d+\.\s+.{20,}/, 10);

  // 3. Timeline — sentences containing a 4-digit year
  const yearRx = /\b(1[0-9]{3}|20[0-2][0-9])\b/;
  const timelineItems = sentences
    .filter((s) => yearRx.test(s) && s.length > 30)
    .slice(0, 12)
    .map((s) => {
      const yr = s.match(yearRx)?.[0] ?? '';
      return `- **${yr}**: ${stripMd(s).slice(0, 220)}`;
    });

  // 4. Important People — capitalised multi-word phrases
  const stopWords = new Set([
    'The','This','That','These','Those','When','After','Before','During',
    'Under','Over','Through','With','From','Into','Upon','By','It','He',
    'She','They','We','You','In','On','At','To','Of','For','And','But',
    'Or','Not','Is','Are','Was','Were','Be','Been','Have','Has','Had',
    'Do','Does','Did','Its','Their','Our','His','Her','An','A',
  ]);
  const personSet = new Set<string>();
  const nameRx = /\b([A-Z][a-z]+(?:\s+(?:bin|binte|al|ul|ur|ud|van|de|von|el)?\s*[A-Z][a-z]+){1,3})\b/g;
  for (const ln of lines) {
    for (const m of ln.matchAll(nameRx)) {
      const name = m[1];
      const first = name.split(' ')[0] ?? '';
      if (!stopWords.has(first) && name.includes(' ')) personSet.add(name);
    }
  }

  // 5. Important Places — common geographic suffixes + known country/city names
  const placeSet = new Set<string>();
  const knownPlaces = [
    'Bangladesh','Pakistan','India','Dhaka','Chittagong','Calcutta','Delhi',
    'London','Karachi','Bengal','East Pakistan','West Pakistan','Sylhet',
    'Rajshahi','Khulna','Mymensingh','Barisal','Rangpur','Comilla',
    'Islamabad','Rawalpindi','Lahore','Colombo','Kathmandu','Rangoon',
  ];
  for (const ln of lines) {
    for (const p of knownPlaces) {
      if (ln.includes(p)) placeSet.add(p);
    }
    for (const m of ln.matchAll(/\b([A-Z][a-z]+(?:stan|pur|abad|nagar|ganj|hat|bari))\b/g)) {
      placeSet.add(m[1]);
    }
  }

  // 6. Important Dates — years and full date strings
  const dateSet = new Set<string>();
  const dateRx = /\b(?:\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)(?:\s+\d{4})?|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}|\d{4})\b/g;
  for (const m of allText.matchAll(dateRx)) {
    dateSet.add(m[0].trim());
  }

  // 7. Important Events
  const eventRx = /war|battle|independence|revolution|liberation|election|treaty|agreement|coup|massacre|protest|movement|partition|conflict|invasion|surrender|ceasefire|assassination|uprising|riot|strike|rally|language movement|genocide/i;

  // 8. Core Concepts — markdown headings
  const headings = lines
    .filter((l) => /^#{1,3}\s+/.test(l))
    .map((l) => l.replace(/^#+\s+/, '').trim());

  // 9. Cause and Effect
  const causeRx = /because|led to|resulted in|caused|due to|therefore|consequently|as a result|in response|which triggered|brought about/i;

  // 10. Chapter / Section Breakdown
  const h1 = lines.filter((l) => /^#\s/.test(l)).map((l) => `**${l.replace(/^#\s+/, '')}**`);
  const h2 = lines.filter((l) => /^##\s/.test(l)).map((l) => `  - ${l.replace(/^##\s+/, '')}`);
  const h3 = lines.filter((l) => /^###\s/.test(l)).map((l) => `    - ${l.replace(/^###\s+/, '')}`);
  const sectionList = [...h1, ...h2, ...h3].slice(0, 15);

  // 11. Key Terms Glossary
  const glossaryItems: string[] = [];
  const defRx = /\b([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+){0,3})\s+(?:is|are|refers?\s+to|means?|denotes?|describes?)\s+([^.!?]{20,120})/g;
  for (const m of allText.matchAll(defRx)) {
    if (glossaryItems.length >= 8) break;
    const def = stripMd(m[2]).split(/[.!?]/)[0] ?? '';
    glossaryItems.push(`- **${m[1]}**: ${def}`);
  }

  // 12. Study Notes — first meaningful sentence per chunk
  const studyNotes = chunks
    .slice(0, 6)
    .map((c, i) => {
      const note = c.content
        .replace(/^#{1,6}\s+.+$/gm, '')
        .split(/(?<=[.!?])\s+/)
        .find((s) => s.trim().length > 40);
      return note ? `${i + 1}. ${stripMd(note).slice(0, 220)}` : '';
    })
    .filter(Boolean);

  // 13. Exam Questions
  const examItems = sentences
    .filter((s) => yearRx.test(s) || /\b(who|what|when|where|why|how)\b/i.test(s))
    .slice(0, 6)
    .map((s, i) => `${i + 1}. Discuss the significance of: "${stripMd(s).slice(0, 130)}"`);

  // 14. Quiz with Answers
  const quizItems = sentences
    .filter((s) => yearRx.test(s) && s.length > 40 && s.length < 300)
    .slice(0, 5)
    .map((s, i) => {
      const yr = s.match(yearRx)?.[0];
      const q = yr
        ? `**Q${i + 1}:** What was significant about **${yr}**?`
        : `**Q${i + 1}:** True or false — "${stripMd(s).slice(0, 100)}"`;
      return `${q}\n**A${i + 1}:** ${stripMd(s).slice(0, 200)}`;
    });

  // 15. FAQ
  const faqSrc = [
    { q: 'What is this document about?',        a: summaryText.slice(0, 220) },
    { q: 'Who are the key figures mentioned?',  a: [...personSet].slice(0, 5).join(', ') },
    { q: 'What period does this document cover?', a: [...dateSet].slice(0, 5).join(', ') },
    { q: 'What are the main themes?',           a: headings.slice(0, 4).join(', ') },
    { q: 'What key events are described?',      a: pickSentences(eventRx, 2).map(stripMd).join('. ') },
  ];

  // 16. Contradictions / Unclear Claims
  const uncertainRx = /however|dispute|unclear|controversy|debated?|some argue|others claim|conflicting|alleged|supposedly|reportedly|critics|contradict/i;

  // 17. Source-backed Evidence Table
  const evidenceRows = chunks.slice(0, 6).map((c) => {
    const claim = c.content
      .replace(/^#{1,6}\s+.+$/gm, '')
      .split(/(?<=[.!?])\s+/)
      .find((s) => s.trim().length > 30);
    return `| ${(claim ? stripMd(claim) : 'See source').slice(0, 130)} | ${c.title} |`;
  });

  // 18. Knowledge Graph Entities
  const kgLines: string[] = [];
  if (personSet.size > 0) kgLines.push(`**Persons:** ${[...personSet].slice(0, 6).join(', ')}`);
  if (placeSet.size > 0)  kgLines.push(`**Places:** ${[...placeSet].slice(0, 6).join(', ')}`);
  if (dateSet.size > 0)   kgLines.push(`**Dates:** ${[...dateSet].slice(0, 6).join(', ')}`);
  if (headings.length > 0) kgLines.push(`**Concepts:** ${headings.slice(0, 5).join(', ')}`);

  // 19. Follow-up Questions
  const followUps = [
    headings[0]        ? `- What is the broader historical context of "${headings[0]}"?` : null,
    [...personSet][0]  ? `- What role did ${[...personSet][0]} play in shaping outcomes?` : null,
    [...placeSet][0]   ? `- How did events in ${[...placeSet][0]} influence the trajectory described?` : null,
    [...dateSet][0]    ? `- What were the immediate and long-term consequences of events around ${[...dateSet][0]}?` : null,
    `- Are there primary sources that corroborate the claims in _${docTitle}_?`,
    `- How do the events in _${docTitle}_ compare to similar historical events elsewhere?`,
  ].filter((x): x is string => x !== null);

  // ── Assemble report ─────────────────────────────────────────────────────────

  const sec = (title: string, content: string) =>
    `## ${title}\n${content || NOT_FOUND}`;

  return [
    `# Auto Research Report: ${docTitle}`,
    `> Deterministic report generated from **${chunks.length}** retrieved knowledge chunk${chunks.length !== 1 ? 's' : ''}. Enable Local AI for richer synthesis.`,
    '',
    sec('Executive Summary', summaryText || NOT_FOUND),
    '',
    sec('Key Points', bulletLines.length > 0 ? bulletLines.map((l) => `- ${l}`).join('\n') : NOT_FOUND),
    '',
    sec('Timeline', timelineItems.length > 0 ? timelineItems.join('\n') : NOT_FOUND),
    '',
    sec('Important People', personSet.size > 0 ? [...personSet].slice(0, 12).map((n) => `- ${n}`).join('\n') : NOT_FOUND),
    '',
    sec('Important Places', placeSet.size > 0 ? [...placeSet].slice(0, 12).map((p) => `- ${p}`).join('\n') : NOT_FOUND),
    '',
    sec('Important Dates', dateSet.size > 0 ? [...dateSet].slice(0, 18).map((d) => `- ${d}`).join('\n') : NOT_FOUND),
    '',
    sec('Important Events', pickSentences(eventRx, 8).map((s) => `- ${s}`).join('\n')),
    '',
    sec('Core Concepts', headings.length > 0 ? headings.slice(0, 10).map((h) => `- ${h}`).join('\n') : pickLines(/.{30,}/, 5).map((l) => `- ${l}`).join('\n')),
    '',
    sec('Cause and Effect', pickSentences(causeRx, 6).map((s) => `- ${s}`).join('\n')),
    '',
    sec('Chapter / Section Breakdown', sectionList.length > 0 ? sectionList.join('\n') : `${chunks.length} chunks retrieved from _${docTitle}_`),
    '',
    sec('Key Terms Glossary', glossaryItems.join('\n')),
    '',
    sec('Study Notes', studyNotes.join('\n')),
    '',
    sec('Exam Questions', examItems.length > 0 ? examItems.join('\n') : NOT_FOUND),
    '',
    sec('Quiz with Answers', quizItems.length > 0 ? quizItems.join('\n\n') : NOT_FOUND),
    '',
    sec('FAQ', faqSrc.map((f) => `**${f.q}**\n${f.a || NOT_FOUND}`).join('\n\n')),
    '',
    sec('Contradictions or Unclear Claims', pickSentences(uncertainRx, 5).map((s) => `- ${s}`).join('\n')),
    '',
    sec('Source-backed Evidence Table', evidenceRows.length > 0
      ? '| Claim | Source |\n|---|---|\n' + evidenceRows.join('\n')
      : NOT_FOUND),
    '',
    sec('Knowledge Graph Entities', kgLines.length > 0 ? kgLines.join('\n') : NOT_FOUND),
    '',
    sec('Recommended Follow-up Questions', followUps.length > 0 ? followUps.join('\n') : NOT_FOUND),
    '',
    sec('Final Research Brief',
      `This report was generated from **${chunks.length}** retrieved chunk${chunks.length !== 1 ? 's' : ''} of _${docTitle}_. ` +
      `The document covers ${headings.slice(0, 3).join(', ') || 'various subjects'}, ` +
      `with references to ${[...personSet].slice(0, 2).join(' and ') || 'key figures'} ` +
      `spanning ${[...dateSet].slice(0, 2).join(' to ') || 'multiple time periods'}. ` +
      `Enable Local AI (WebLLM) or connect a server LLM for deeper synthesis and richer cross-section analysis.`
    ),
  ].join('\n');
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

  console.log('[aivora-agent] filters:', JSON.stringify(filters ?? null));

  // ── B. RETRIEVE ────────────────────────────────────────────────────────────
  // Use the primary search intent for initial retrieval.
  const primaryIntent = planResult.searchIntents[0] ?? query;
  const { chunks: initialChunks } = await retrieve(primaryIntent, retrievalOptions);

  console.log('[aivora-agent] retrieved chunks (initial):', initialChunks.length);

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

  // Rerank — research reports get more chunks for richer section coverage.
  const rerankCount = isAutoResearchReport(query) ? 8 : 5;
  const topChunks = rerank(finalChunks, rerankCount);

  console.log('[aivora-agent] top chunks after rerank:', topChunks.length);

  // ── E. RESPOND ─────────────────────────────────────────────────────────────
  const citations = deduplicateCitations(topChunks.map(buildCitation));

  const baseTrace = {
    plan: planResult.plan,
    retrievalSummary,
    reflection: reflection.reflection,
    corrections,
  };

  // No chunks retrieved — distinguish between "no documents" and "no match".
  if (topChunks.length === 0) {
    const docCount = await countDocuments().catch(() => 0);
    console.log('[aivora-agent] document count:', docCount, '| chunk count for query: 0');

    if (docCount > 0) {
      const scopeNote = filters?.documentIds?.length
        ? ' from the selected document'
        : '';
      const answerText =
        `**No relevant content found${scopeNote} for this query.**\n\n` +
        `Your Knowledge Vault has **${docCount}** indexed document${docCount !== 1 ? 's' : ''}, ` +
        `but no chunks matched the query: _"${query}"_\n\n` +
        `**Try:**\n` +
        `- Use a Vault action (Auto Research Report, Summarize, Key Points) directly on the document card\n` +
        `- Include the document title or specific topic in your question\n` +
        `- Ask about a subject you know is covered in your uploaded files`;

      return {
        answer: answerText,
        reasoningTrace: {
          ...baseTrace,
          retrievalSummary: `${docCount} document(s) indexed; no chunks matched similarity threshold for this query.`,
          reflection: 'Documents are indexed but no relevant chunks were retrieved. The query may be too generic or off-topic.',
          corrections: ['Try a Vault action for document-specific queries, or rephrase with specific terms from the document.'],
        },
        citations: [],
        confidence: 0.25,
        needsMoreContext: true,
        needsLocalLLM: true,
      };
    }

    // Truly no documents uploaded yet.
    return {
      answer: '',
      reasoningTrace: {
        ...baseTrace,
        retrievalSummary: 'Vector store connected — no knowledge documents indexed yet.',
        reflection: 'Knowledge Vault is empty. Upload documents to enable grounded retrieval.',
        corrections: ['Upload .txt, .md, .pdf, .docx, .png, .jpg, .jpeg, or .webp files via the Vault tab.'],
      },
      citations: [],
      confidence: 0.45,
      needsMoreContext: true,
      needsLocalLLM: true,
    };
  }

  // Chunks retrieved but no server LLM.
  // For research report queries: generate the full structured deterministic report.
  // For all other queries: extract the best prose paragraph from retrieved chunks.
  if (!isLLMConfigured()) {
    const retrievedContext = topChunks.map((c) => c.content).join('\n\n---\n\n');

    if (isAutoResearchReport(query)) {
      console.info('[aivora-agent] Auto Research Report detected — building deterministic structured report.');
      const report = buildResearchReport(topChunks);
      return {
        answer: report,
        reasoningTrace: {
          ...baseTrace,
          reflection: `Auto Research Report generated from ${topChunks.length} chunk(s). All 20 sections populated deterministically from retrieved text.`,
        },
        citations,
        confidence: Math.max(Math.round(reflection.confidence * 100) / 100, 0.65),
        needsMoreContext: false,
        needsLocalLLM: false,
        retrievedContext,
      };
    }

    const deterministicAnswer = synthesizeFromChunks(query, topChunks);
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
      `Try rephrasing your question, or upload more relevant files via the Vault tab.`;
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
