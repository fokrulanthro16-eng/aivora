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

function isCompareDocuments(query: string): boolean {
  const lc = query.toLowerCase();
  return (
    lc.includes('compare the following selected documents') ||
    lc.includes('executive comparison summary') ||
    lc.includes('final comparative brief')
  );
}

function isDebateMode(query: string): boolean {
  const lc = query.toLowerCase();
  return (
    lc.includes('structured academic debate') ||
    lc.includes('position of document a') ||
    lc.includes('neutral judge summary')
  );
}

// ── Multi-document shared helpers ─────────────────────────────────────────────

type DocGroup = { title: string; chunks: HybridSearchResult[] };

function groupByDocument(chunks: HybridSearchResult[]): DocGroup[] {
  const map = new Map<string, DocGroup>();
  for (const c of chunks) {
    if (!map.has(c.document_id)) {
      map.set(c.document_id, { title: c.title, chunks: [] });
    }
    map.get(c.document_id)!.chunks.push(c);
  }
  return [...map.values()];
}

function mdocSentences(chunks: HybridSearchResult[], pattern?: RegExp, max = 4): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const c of chunks) {
    for (const s of c.content.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 25)) {
      if ((!pattern || pattern.test(s)) && !seen.has(s)) {
        seen.add(s);
        result.push(s.replace(/\*\*(.+?)\*\*/g, '$1'));
        if (result.length >= max) return result;
      }
    }
  }
  return result;
}

function mdocYears(chunks: HybridSearchResult[]): string[] {
  const years = new Set<string>();
  for (const c of chunks) {
    for (const m of c.content.matchAll(/\b(1[0-9]{3}|20[0-2][0-9])\b/g)) {
      years.add(m[1]);
    }
  }
  return [...years].slice(0, 10);
}

function mdocNames(chunks: HybridSearchResult[]): string[] {
  const names = new Set<string>();
  const stopWords = new Set([
    'The','This','These','Those','When','After','Before','During',
    'Over','From','By','In','On','At','To','Of','And','But','Or',
    'With','For','Into','Its','He','She','They','We',
  ]);
  for (const c of chunks) {
    for (const m of c.content.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g)) {
      const name = m[1];
      if (name.includes(' ') && !stopWords.has(name.split(' ')[0]!)) names.add(name);
    }
  }
  return [...names].slice(0, 8);
}

function mdocPlaces(chunks: HybridSearchResult[]): string[] {
  const places = new Set<string>();
  const known = [
    'Bangladesh','Pakistan','India','Dhaka','Chittagong','Bengal',
    'East Pakistan','West Pakistan','London','Delhi','Karachi',
    'Aivora','Sylhet','Rajshahi','Khulna','Rangpur',
  ];
  for (const c of chunks) {
    for (const p of known) {
      if (c.content.includes(p)) places.add(p);
    }
    for (const m of c.content.matchAll(/\b([A-Z][a-z]+(?:stan|pur|abad|nagar|ganj))\b/g)) {
      places.add(m[1]);
    }
  }
  return [...places].slice(0, 8);
}

// ── Comparison report builder ─────────────────────────────────────────────────

function buildComparisonReport(chunks: HybridSearchResult[]): string {
  const NOT_FOUND = '_Not found in the selected document chunks._';
  const docs = groupByDocument(chunks);

  if (docs.length < 2) {
    return (
      '**Multi-document comparison requires chunks from at least 2 documents.**\n\n' +
      'Please select 2 or more documents with indexed chunks via the Vault tab.'
    );
  }

  const label = (i: number) => String.fromCharCode(65 + i);
  const docLabels = docs.map((d, i) => `- **Document ${label(i)}**: _${d.title}_`);
  const yearRx = /\b(1[0-9]{3}|20[0-2][0-9])\b/;
  const eventRx = /war|battle|independence|revolution|liberation|election|treaty|partition|conflict|movement/i;
  const causeRx = /because|led to|resulted in|caused|due to|therefore|consequently|as a result/i;

  const docSummary = (d: DocGroup) => {
    const text = d.chunks.slice(0, 2).map((c) => c.content.replace(/^#{1,6}\s+.+$/gm, '').trim()).join(' ');
    return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 30).slice(0, 3)
      .map((s) => s.replace(/\*\*(.+?)\*\*/g, '$1')).join(' ') || NOT_FOUND;
  };

  const allYearSets = docs.map((d) => new Set(mdocYears(d.chunks)));
  const commonYears = [...(allYearSets[0] ?? new Set<string>())].filter(
    (y) => allYearSets.slice(1).every((s) => s.has(y)),
  );
  const uniqueYears = docs.map((d, i) => {
    const mine = new Set(mdocYears(d.chunks));
    const others = new Set(docs.filter((_, j) => j !== i).flatMap((x) => mdocYears(x.chunks)));
    return [...mine].filter((y) => !others.has(y));
  });

  const evidenceRows = docs.flatMap((d, i) =>
    d.chunks.slice(0, 2).map((c) => {
      const claim = c.content.replace(/^#{1,6}\s+.+$/gm, '').split(/(?<=[.!?])\s+/).find((s) => s.trim().length > 30);
      return `| Doc ${label(i)} | ${claim ? claim.replace(/\*\*(.+?)\*\*/g, '$1').slice(0, 120) : 'See source'} | ${d.title} |`;
    }),
  );

  const sec = (title: string, content: string) => `## ${title}\n${content || NOT_FOUND}`;

  return [
    `# Document Comparison Report`,
    `> Comparing **${docs.length}** documents using **${chunks.length}** retrieved chunks.`,
    '',
    `**Documents being compared:**`,
    docLabels.join('\n'),
    '',
    sec('Executive Comparison Summary',
      docs.map((d, i) => `**Doc ${label(i)} (_${d.title}_):** ${docSummary(d)}`).join('\n\n')),
    '',
    sec('Similarities',
      commonYears.length > 0
        ? `Both documents share references to: **${commonYears.join(', ')}**\n\n` +
          docs.map((d, i) => {
            const shared = mdocSentences(d.chunks, /shared|both|similar|common|also/i, 2);
            return shared.length > 0 ? `**Doc ${label(i)}:** ${shared[0]}` : '';
          }).filter(Boolean).join('\n')
        : 'No direct common time periods found from retrieved chunks. Topics may differ significantly.'),
    '',
    sec('Differences',
      docs.map((d, i) => {
        const unique = uniqueYears[i] ?? [];
        const events = mdocSentences(d.chunks, eventRx, 2);
        return (
          `**Doc ${label(i)} (_${d.title}_):**\n` +
          (unique.length > 0 ? `- Unique time references: ${unique.join(', ')}\n` : '') +
          (events.length > 0 ? events.map((e) => `- ${e}`).join('\n') : '- Distinct events not isolated from retrieved chunks.')
        );
      }).join('\n\n')),
    '',
    sec('Contradictions or Conflicting Claims',
      docs.flatMap((d, i) =>
        mdocSentences(d.chunks, /however|unlike|contrary|instead|whereas|dispute|contradict/i, 2)
          .map((s) => `- **Doc ${label(i)}:** ${s}`),
      ).join('\n')),
    '',
    sec('Timeline Comparison',
      docs.map((d, i) => {
        const years = mdocYears(d.chunks);
        const sents = mdocSentences(d.chunks, yearRx, 4);
        return (
          `**Doc ${label(i)} (_${d.title}_):** ${years.join(', ') || 'No specific dates found'}\n` +
          sents.map((s) => `  - ${s}`).join('\n')
        );
      }).join('\n\n')),
    '',
    sec('People / Organizations Comparison',
      docs.map((d, i) => {
        const names = mdocNames(d.chunks);
        return `**Doc ${label(i)} (_${d.title}_):**\n${names.length > 0 ? names.map((n) => `- ${n}`).join('\n') : '- None identified'}`;
      }).join('\n\n')),
    '',
    sec('Places Comparison',
      docs.map((d, i) => {
        const places = mdocPlaces(d.chunks);
        return `**Doc ${label(i)} (_${d.title}_):**\n${places.length > 0 ? places.map((p) => `- ${p}`).join('\n') : '- None identified'}`;
      }).join('\n\n')),
    '',
    sec('Key Concepts Comparison',
      docs.map((d, i) => {
        const headings = d.chunks.flatMap((c) =>
          c.content.split('\n').filter((l) => /^#{1,3}\s/.test(l)).map((l) => l.replace(/^#+\s+/, '')),
        );
        return (
          `**Doc ${label(i)} (_${d.title}_):**\n` +
          (headings.length > 0 ? headings.slice(0, 5).map((h) => `- ${h}`).join('\n') : '- Concepts not identified from headings')
        );
      }).join('\n\n')),
    '',
    sec('Evidence Table',
      evidenceRows.length > 0
        ? '| Doc | Evidence | Source |\n|---|---|---|\n' + evidenceRows.join('\n')
        : NOT_FOUND),
    '',
    sec('Source-backed Findings',
      docs.map((d, i) => {
        const findings = mdocSentences(d.chunks, causeRx, 3);
        return (
          `**Doc ${label(i)} (_${d.title}_):**\n` +
          (findings.length > 0 ? findings.map((f) => `- ${f}`).join('\n') : '- No causal chains identified')
        );
      }).join('\n\n')),
    '',
    sec('Final Comparative Brief',
      `Comparison generated from **${chunks.length}** retrieved chunks across **${docs.length}** documents.\n\n` +
      docs.map((d, i) => `- **Document ${label(i)}** (_${d.title}_): ${d.chunks.length} chunk${d.chunks.length !== 1 ? 's' : ''}`).join('\n') +
      '\n\nEnable Local AI or connect a server LLM for deeper cross-document analysis.'),
  ].join('\n');
}

// ── Debate report builder ─────────────────────────────────────────────────────

function buildDebateReport(chunks: HybridSearchResult[]): string {
  const NOT_FOUND = '_Not found in the selected document chunks._';
  const docs = groupByDocument(chunks);

  if (docs.length < 2) {
    return (
      '**Debate Mode requires chunks from at least 2 documents.**\n\n' +
      'Please select 2 or more documents with indexed chunks via the Vault tab.'
    );
  }

  const label = (i: number) => String.fromCharCode(65 + i);
  const docLabels = docs.map((d, i) => `- **Document ${label(i)}**: _${d.title}_`);
  const yearRx = /\b(1[0-9]{3}|20[0-2][0-9])\b/;

  const allYearSets = docs.map((d) => new Set(mdocYears(d.chunks)));
  const commonYears = [...(allYearSets[0] ?? new Set<string>())].filter(
    (y) => allYearSets.slice(1).every((s) => s.has(y)),
  );

  const docKeyPoints = (d: DocGroup, max = 4): string[] => {
    const out: string[] = [];
    for (const c of d.chunks) {
      for (const l of c.content.split('\n')) {
        const t = l.trim();
        if (/^[-*•]\s+.{20,}/.test(t)) {
          out.push(t.replace(/^[-*•]\s+/, ''));
          if (out.length >= max) return out;
        }
      }
    }
    return out;
  };

  const positions = docs.map((d, i) => {
    const sents = mdocSentences(d.chunks, undefined, 4);
    const pts = docKeyPoints(d);
    return (
      `## Position of Document ${label(i)}: _${d.title}_\n` +
      (sents.length > 0 ? sents.slice(0, 3).map((s) => `- ${s}`).join('\n') : NOT_FOUND) +
      (pts.length > 0 ? '\n\n**Key claims:**\n' + pts.map((p) => `- ${p}`).join('\n') : '')
    );
  });

  const sec = (title: string, content: string) => `## ${title}\n${content || NOT_FOUND}`;

  return [
    `# Structured Debate: Document Analysis`,
    `> Debate Mode — **${docs.length}** documents, **${chunks.length}** retrieved chunks`,
    '',
    '**Debating documents:**',
    docLabels.join('\n'),
    '',
    ...positions.map((p) => p + '\n'),
    sec('Evidence from Each Document',
      docs.map((d, i) => {
        const sents = mdocSentences(d.chunks, undefined, 3);
        return (
          `**Document ${label(i)} (_${d.title}_):**\n` +
          (sents.length > 0 ? sents.map((s) => `> ${s}`).join('\n\n') : NOT_FOUND)
        );
      }).join('\n\n')),
    '',
    sec('Strongest Arguments',
      docs.map((d, i) => {
        const factual = mdocSentences(d.chunks, yearRx, 3).filter((s) => yearRx.test(s));
        return `**Document ${label(i)}:** ${factual.length > 0 ? factual[0] : 'No specific factual claims identified from retrieved chunks.'}`;
      }).join('\n\n')),
    '',
    sec('Weakest Arguments',
      docs.map((d, i) => {
        const uncertain = mdocSentences(d.chunks, /allegedly|reportedly|may have|might|unclear|debated|supposedly/i, 2);
        return `**Document ${label(i)}:** ${uncertain.length > 0 ? uncertain[0] : 'No clearly weak or uncertain claims identified — retrieved chunks appear factual.'}`;
      }).join('\n\n')),
    '',
    sec('Points of Agreement',
      commonYears.length > 0
        ? `Both documents reference the following time periods: **${commonYears.join(', ')}**`
        : 'No direct common claims identified from retrieved chunks. Documents may cover distinct topics.'),
    '',
    sec('Points of Disagreement',
      docs.map((d, i) => {
        const contrasting = mdocSentences(d.chunks, /however|unlike|contrary|instead|whereas|but/i, 2);
        return `**Document ${label(i)}:** ${contrasting.length > 0 ? contrasting[0] : 'No explicit disagreement identified from retrieved chunks.'}`;
      }).join('\n\n')),
    '',
    sec('Neutral Judge Summary',
      `Based on **${chunks.length}** retrieved chunks across **${docs.length}** documents:\n\n` +
      docs.map((d, i) => {
        const sents = mdocSentences(d.chunks, undefined, 2);
        return `- **Document ${label(i)}** (_${d.title}_): ${sents.length > 0 ? (sents[0] ?? '').slice(0, 200) : 'Limited content retrieved.'}`;
      }).join('\n') +
      '\n\nThis comparison is deterministic — based on retrieved text. Enable Local AI for deeper synthesis.'),
    '',
    sec('Final Verdict',
      `Debate summary across **${docs.length}** sources with **${chunks.length}** total chunks.\n` +
      docs.map((d, i) => `- Document ${label(i)} (_${d.title}_): ${d.chunks.length} chunks`).join('\n') +
      '\n\nFor a richer analytical verdict, enable Local AI (WebLLM) or connect a server LLM API.'),
  ].join('\n');
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

// ── Studio workflow detection ─────────────────────────────────────────────────

type StudioWorkflow =
  | 'study-pack' | 'action-items' | 'presentation' | 'blog-post'
  | 'linkedin' | 'github-readme' | 'graphical-report' | 'transcript-summary'
  | 'scene-breakdown' | 'video-script' | 'storyboard' | 'video-intel'
  | 'knowledge-graph';

function detectStudioWorkflow(query: string): StudioWorkflow | null {
  const lc = query.toLowerCase();
  if (lc.includes('generate a complete study pack')) return 'study-pack';
  if (lc.includes('extract all action items')) return 'action-items';
  if (
    lc.includes('10-slide presentation outline') ||
    lc.includes('pptx-ready presentation') ||
    lc.includes('create presentation outline') ||
    lc.includes('speaker notes') && lc.includes('suggested visual')
  ) return 'presentation';
  if (lc.includes('create a blog post')) return 'blog-post';
  if (lc.includes('create a linkedin post')) return 'linkedin';
  if (lc.includes('generate a github readme')) return 'github-readme';
  if (lc.includes('graphical report with key statistics')) return 'graphical-report';
  if (lc.includes('summarize this transcript')) return 'transcript-summary';
  if (lc.includes('create a scene breakdown') || lc.includes('scene breakdown from this')) return 'scene-breakdown';
  if (
    lc.includes('video script with hook') ||
    lc.includes('short-form script') ||
    lc.includes('long-form script')
  ) return 'video-script';
  if (lc.includes('storyboard with scene number') || lc.includes('storyboard for this')) return 'storyboard';
  if (lc.includes('video intelligence report') || lc.includes('media intelligence')) return 'video-intel';
  if (lc.includes('build a knowledge graph')) return 'knowledge-graph';
  return null;
}

// ── Studio workflow builders ──────────────────────────────────────────────────

function studioNF(): string { return '_Not found in the selected document chunks._'; }

function studioSec(title: string, content: string): string {
  return `## ${title}\n${content || studioNF()}`;
}

function studioSentences(chunks: HybridSearchResult[], pattern?: RegExp, max = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chunks) {
    for (const s of c.content.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 25)) {
      if ((!pattern || pattern.test(s)) && !seen.has(s)) {
        seen.add(s);
        out.push(s.replace(/\*\*(.+?)\*\*/g, '$1'));
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}

function studioHeadings(chunks: HybridSearchResult[]): string[] {
  return chunks
    .flatMap((c) => c.content.split('\n').filter((l) => /^#{1,3}\s/.test(l)).map((l) => l.replace(/^#+\s+/, '').trim()))
    .filter(Boolean);
}

/**
 * Strip OCR garbage, bare page/index numbers, table-separator rows, and very
 * short noise lines before extracting sentences for structured outputs.
 */
function cleanChunkContent(raw: string): string {
  return raw
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      if (!t) return false;
      if (/^\d+$/.test(t)) return false;                          // bare page / index numbers
      if (/^[\d\s|.,:\-–—]{1,50}$/.test(t)) return false;        // table separators / OCR rows
      if (t.length < 12 && !/^#{1,3}\s/.test(t)) return false;   // micro-fragments
      const digitRatio = (t.match(/\d/g) ?? []).length / t.length;
      if (digitRatio > 0.45 && t.length < 60) return false;      // >45% digits = numeric garbage
      return true;
    })
    .join('\n')
    .replace(/[ \t]{3,}/g, '  ')
    .trim();
}

/**
 * Sentence extractor that runs cleanChunkContent first — filters OCR garbage,
 * repeated numbers, and broken fragments before yielding usable sentences.
 * Use this instead of studioSentences for presentation / video outputs.
 */
function cleanSentences(
  chunks: HybridSearchResult[],
  pattern?: RegExp,
  max = 6,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chunks) {
    const cleaned = cleanChunkContent(c.content)
      .replace(/^#{1,6}\s+.+$/gm, '');
    for (const s of cleaned.split(/(?<=[.!?])\s+/).map((x) => x.trim())) {
      if (s.length < 30) continue;
      if (/^\d[\d\s.,]*$/.test(s)) continue;                     // pure numeric
      if ((s.match(/\d/g) ?? []).length > s.length * 0.4) continue; // too many digits
      const norm = s.replace(/\*\*(.+?)\*\*/g, '$1');
      if ((!pattern || pattern.test(norm)) && !seen.has(norm)) {
        seen.add(norm);
        out.push(norm);
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}

/**
 * Returns a specific, content-aware visual suggestion for a given slide/scene
 * context — avoids generic "[Diagram illustrating Section N]" placeholders.
 */
function presentationVisual(
  context: string,
  persons: string[],
  places: string[],
  years: string[],
): string {
  const lc = context.toLowerCase();
  if (/title|introduction|overview/.test(lc))
    return `Title card with document name and key subtitle`;
  if (/background|context|histor|origin|found|colonial|ancient/.test(lc))
    return years.length > 0
      ? `Historical timeline from ${years[0]} to ${years[years.length - 1]}`
      : `Context map or historical background graphic`;
  if (/timeline|chronolog|process|phase|stage|step/.test(lc))
    return years.length > 2
      ? `Chronological timeline: ${years.slice(0, 4).join(' → ')}`
      : `Process flowchart showing sequence of events`;
  if (/people|person|leader|figure|who|key figure|portrait/.test(lc))
    return persons.length > 0
      ? `Portrait or role cards featuring ${persons.slice(0, 3).join(', ')}`
      : `Key figures gallery with names and roles`;
  if (/place|location|region|geography|map|where/.test(lc))
    return places.length > 0
      ? `Map highlighting ${places.slice(0, 3).join(', ')}`
      : `Geographic reference map`;
  if (/evidence|source|data|statistic|number|finding|fact/.test(lc))
    return `Data table or bar chart drawn from source material`;
  if (/implication|lesson|impact|consequence|result|outcome|mean/.test(lc))
    return `Cause-and-effect diagram or lessons-learned framework`;
  if (/summary|conclusion|q&a|final|wrap/.test(lc))
    return `Key takeaways card — three bullet points with call to action`;
  if (/scene|segment|clip|moment/.test(lc))
    return places.length > 0
      ? `Establishing shot: ${places[0]}`
      : `Contextual scene graphic or B-roll suggestion`;
  // Fallback: use first available entity for specificity
  if (persons.length > 0) return `Graphic featuring ${persons[0]} in context`;
  if (places.length > 0) return `Visual of ${places[0]} or related location`;
  return `Illustrative graphic supporting "${context.slice(0, 60)}"`;
}

function buildStudyPack(chunks: HybridSearchResult[]): string {
  const docTitle = chunks[0]?.title ?? 'the document';
  const allText = chunks.map((c) => c.content).join('\n\n');
  const headings = studioHeadings(chunks);
  const yearRx = /\b(1[0-9]{3}|20[0-2][0-9])\b/;

  const glossary: string[] = [];
  for (const m of allText.matchAll(/\b([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+){0,3})\s+(?:is|are|refers?\s+to|means?|denotes?)\s+([^.!?]{20,100})/g)) {
    if (glossary.length >= 10) break;
    glossary.push(`- **${m[1]}**: ${(m[2].split(/[.!?]/)[0] ?? '').trim()}`);
  }

  const keyFacts = studioSentences(chunks, yearRx, 8);
  const flashcards = keyFacts.slice(0, 6).map((s, i) =>
    `**Q${i + 1}**: Describe the significance of: _"${s.slice(0, 120)}"_\n**A${i + 1}**: ${s.slice(0, 200)}`,
  );
  const examQ = keyFacts.map((s, i) => {
    const yr = s.match(yearRx)?.[0];
    return `${i + 1}. ${yr ? `What happened in **${yr}**?` : `Explain: "${s.slice(0, 100)}"`}`;
  });
  const notes = chunks.slice(0, 5).map((c, i) => {
    const note = c.content.replace(/^#{1,6}\s+.+$/gm, '').split(/(?<=[.!?])\s+/).find((s) => s.trim().length > 40);
    return note ? `${i + 1}. ${note.replace(/\*\*(.+?)\*\*/g, '$1').trim().slice(0, 220)}` : '';
  }).filter(Boolean);

  return [
    `# Study Pack: ${docTitle}`,
    `> Generated from **${chunks.length}** retrieved chunks.`,
    '',
    studioSec('Key Concepts', headings.length > 0 ? headings.slice(0, 10).map((h) => `- ${h}`).join('\n') : ''),
    '',
    studioSec('Definitions & Glossary', glossary.join('\n')),
    '',
    studioSec('Flashcards (Q&A)', flashcards.join('\n\n')),
    '',
    studioSec('Exam Questions', examQ.join('\n')),
    '',
    studioSec('Summary Notes', notes.join('\n')),
    '',
    studioSec('Mind Map Outline', headings.length > 0 ? `- ${docTitle}\n${headings.slice(0, 8).map((h) => `  - ${h}`).join('\n')}` : ''),
  ].join('\n');
}

function buildActionItems(chunks: HybridSearchResult[]): string {
  const docTitle = chunks[0]?.title ?? 'the document';
  const taskRx = /\b(should|must|will|need to|required to|responsible for|action|task|complete|submit|deliver|report|schedule|review|follow up|deadline|due|assign)\b/i;
  const yearRx = /\b(1[0-9]{3}|20[0-2][0-9])\b/;
  const tasks = studioSentences(chunks, taskRx, 10);
  const deadlines = studioSentences(chunks, yearRx, 6);
  const decisions = studioSentences(chunks, /decided|agreed|confirmed|resolved|approved|rejected/i, 5);
  const questions = studioSentences(chunks, /\?|unclear|unknown|pending|open question/i, 5);

  return [
    `# Action Items: ${docTitle}`,
    `> Extracted from **${chunks.length}** retrieved chunks.`,
    '',
    studioSec('Action Items', tasks.length > 0 ? tasks.map((t) => `- [ ] ${t}`).join('\n') : ''),
    '',
    studioSec('Dates & Deadlines', deadlines.length > 0 ? deadlines.map((d) => `- ${d}`).join('\n') : ''),
    '',
    studioSec('Decisions Made', decisions.length > 0 ? decisions.map((d) => `- ${d}`).join('\n') : ''),
    '',
    studioSec('Open Questions', questions.length > 0 ? questions.map((q) => `- ${q}`).join('\n') : ''),
    '',
    studioSec('Next Steps', tasks.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join('\n')),
  ].join('\n');
}

function buildPresentation(chunks: HybridSearchResult[]): string {
  const docTitle = chunks[0]?.title ?? 'Document';
  const persons = mdocNames(chunks);
  const places  = mdocPlaces(chunks);
  const years   = mdocYears(chunks);
  const yearRx  = /\b(1[0-9]{3}|20[0-2][0-9])\b/;
  const src     = `_Source: ${docTitle}_`;

  // Headings extracted from chunks — use as theme names, skip bare numbers
  const headings = studioHeadings(chunks).filter((h) => h.length > 4 && !/^\d+$/.test(h));

  function makeSlide(
    num: number,
    title: string,
    sents: string[],
    notes: string,
    visual: string,
  ): string {
    const bullets = sents.length > 0
      ? sents.slice(0, 5).map((s) => `- ${s.slice(0, 160)}`).join('\n')
      : studioNF();
    return [
      `## Slide ${num}: ${title}`,
      `**Bullets:**`,
      bullets,
      ``,
      `**Speaker Notes:** ${notes}`,
      `**Suggested Visual:** ${visual}`,
      `**Source:** ${src}`,
    ].join('\n');
  }

  // Sentence pools for each slide — all cleaned before use
  const intro        = cleanSentences(chunks.slice(0, 2), undefined, 5);
  const bgSents      = cleanSentences(chunks, /background|context|histor|origin|found|earliest|ancient|colonial|period/i, 4);
  const theme1Sents  = cleanSentences(chunks.slice(0, 3), undefined, 5);
  const theme2Sents  = cleanSentences(chunks.slice(2, 5), undefined, 5);
  const theme3Sents  = cleanSentences(chunks.slice(4, 7), undefined, 5);
  const timelineSents = cleanSentences(chunks, yearRx, 5);
  const peopleSents  = [
    ...persons.slice(0, 3).map((p) => `Key figure: ${p}`),
    ...places.slice(0, 2).map((p) => `Location: ${p}`),
    ...cleanSentences(chunks, /leader|president|minister|general|poet|founder|figure|director/i, 3),
  ].filter(Boolean).slice(0, 5);
  const evidenceSents = cleanSentences(
    chunks, /according|report|data|survey|shows|found|evidence|percent|million|billion/i, 5,
  );
  const implSents    = cleanSentences(
    chunks, /implication|lesson|result|impact|consequence|therefore|thus|mean|led to|resulted/i, 5,
  );
  const summarySents = cleanSentences(chunks.slice(-3), undefined, 5);

  const t1 = headings[0] ?? 'Main Theme A';
  const t2 = headings[1] ?? 'Main Theme B';
  const t3 = headings[2] ?? 'Main Theme C';

  return [
    `# Presentation Outline: ${docTitle}`,
    `> **10 slides** · grounded in **${chunks.length}** retrieved chunks`,
    ``,
    makeSlide(
      1, 'Introduction & Overview',
      intro.length > 0 ? intro : [`An overview of ${docTitle}`],
      `Welcome the audience. Introduce the topic: _${docTitle}_. State what the presentation will cover and why it matters.`,
      presentationVisual('title introduction overview', persons, places, years),
    ),
    ``,
    makeSlide(
      2, 'Background & Context',
      bgSents.length > 0 ? bgSents : intro.slice(0, 4),
      `Set the scene. Explain the historical or contextual background essential to understanding this topic.`,
      presentationVisual('background context history origin', persons, places, years),
    ),
    ``,
    makeSlide(
      3, t1,
      theme1Sents,
      `Present the first major theme. Use specific facts and quotes from the source to support each bullet point.`,
      presentationVisual(t1, persons, places, years),
    ),
    ``,
    makeSlide(
      4, t2,
      theme2Sents.length > 0 ? theme2Sents : theme1Sents,
      `Explore the second theme. Show how it connects to or contrasts with what was just discussed.`,
      presentationVisual(t2, persons, places, years),
    ),
    ``,
    makeSlide(
      5, t3,
      theme3Sents.length > 0 ? theme3Sents : theme2Sents,
      `Cover the third major theme. Highlight specific examples, data points, or events from the source.`,
      presentationVisual(t3, persons, places, years),
    ),
    ``,
    makeSlide(
      6, 'Timeline & Key Events',
      timelineSents.length > 0
        ? timelineSents
        : years.slice(0, 5).map((y) => `Events centred on ${y}`),
      `Walk the audience through the chronology. Connect dates to outcomes and consequences.`,
      years.length > 2
        ? `Chronological timeline: ${years.slice(0, 5).join(' → ')}`
        : `Flowchart of key stages and turning points`,
    ),
    ``,
    makeSlide(
      7, 'Key People, Places & Events',
      peopleSents,
      `Introduce the main actors and locations. Explain their roles and why they matter to this topic.`,
      persons.length > 0
        ? `Portrait gallery or role chart featuring ${persons.slice(0, 3).join(', ')}`
        : places.length > 0
          ? `Map showing ${places.slice(0, 3).join(', ')}`
          : `Key figures and locations reference card`,
    ),
    ``,
    makeSlide(
      8, 'Evidence & Source Insights',
      evidenceSents.length > 0 ? evidenceSents : intro.slice(0, 4),
      `Present the strongest factual evidence. Reference the source directly. Let the data speak.`,
      `Data table or infographic drawn from ${src}`,
    ),
    ``,
    makeSlide(
      9, 'Implications & Lessons',
      implSents.length > 0 ? implSents : summarySents.slice(0, 4),
      `Discuss what these findings mean. What can be learned, applied, or acted upon from this material?`,
      `Cause-and-effect diagram or lessons-learned framework`,
    ),
    ``,
    makeSlide(
      10, 'Summary & Q&A',
      summarySents.length > 0 ? summarySents : intro.slice(0, 4),
      `Recap the three to five most important points. Invite questions. Thank the audience.`,
      `Key takeaways card — three bullet points with call to action`,
    ),
  ].join('\n');
}

function buildBlogPost(chunks: HybridSearchResult[]): string {
  const docTitle = chunks[0]?.title ?? 'the document';
  const sections = chunks.slice(0, 3).map((c, i) => {
    const heading = c.content.split('\n').find((l) => /^#{1,3}\s/.test(l))?.replace(/^#+\s+/, '') ?? `Section ${i + 1}`;
    const body = studioSentences([c], undefined, 3).join(' ');
    return `## ${heading}\n${body || studioNF()}`;
  });
  const intro = studioSentences(chunks.slice(0, 1), undefined, 2).join(' ');
  const conclusion = studioSentences(chunks.slice(-1), undefined, 2).join(' ');
  const headings = studioHeadings(chunks);
  const tags = headings.slice(0, 5).map((h) => `#${h.toLowerCase().replace(/[^a-z0-9]/g, '')}`).filter(Boolean).join(' ');

  return [
    `# Blog Post: ${docTitle}`,
    '',
    `## Blog Title\n**${docTitle}: Key Insights and Analysis**`,
    '',
    `## Introduction\n${intro || studioNF()}`,
    '',
    ...sections.map((s) => s + '\n'),
    `## Key Takeaways`,
    studioSentences(chunks, undefined, 3).map((s, i) => `${i + 1}. ${s.slice(0, 180)}`).join('\n') || studioNF(),
    '',
    `## Conclusion\n${conclusion || studioNF()}`,
    '',
    `## Tags & Meta\n**Tags:** ${tags || '#research #analysis'}\n**Meta Description:** An analysis of _${docTitle}_ covering key insights and findings.`,
  ].join('\n');
}

function buildLinkedIn(chunks: HybridSearchResult[]): string {
  const docTitle = chunks[0]?.title ?? 'this research';
  const sentences = studioSentences(chunks, undefined, 6);
  const hook = sentences[0] ?? `Exploring ${docTitle}.`;
  const points = sentences.slice(1, 4).map((s) => `→ ${s.slice(0, 150)}`);
  const headings = studioHeadings(chunks);
  const hashtags = [...new Set(headings.slice(0, 5))].map((h) => `#${h.toLowerCase().replace(/[^a-z0-9]/g, '')}`).filter(Boolean).join(' ');

  return [
    `# LinkedIn Post: ${docTitle}`,
    '',
    `## Hook\n${hook}`,
    '',
    `## Key Insight\n${sentences[1] ?? studioNF()}`,
    '',
    `## Supporting Points\n${points.length > 0 ? points.join('\n') : studioNF()}`,
    '',
    `## Call to Action\nWhat are your thoughts on _${docTitle}_? Share below. 👇`,
    '',
    `## Hashtags\n${hashtags || '#research #knowledge #ai'}`,
  ].join('\n');
}

function buildGitHubReadme(chunks: HybridSearchResult[]): string {
  const docTitle = chunks[0]?.title ?? 'Project';
  const overview = studioSentences(chunks.slice(0, 2), undefined, 3).join(' ');
  const headings = studioHeadings(chunks);
  const features = headings.slice(0, 6).map((h) => `- ${h}`).join('\n');
  const techSentences = studioSentences(chunks, /technolog|framework|library|tool|built with|uses/i, 5);

  return [
    `# ${docTitle}`,
    '',
    `## Overview\n${overview || studioNF()}`,
    '',
    `## Features\n${features || studioNF()}`,
    '',
    `## Architecture\n${techSentences.length > 0 ? techSentences.map((s) => `- ${s}`).join('\n') : studioNF()}`,
    '',
    `## Installation\n\`\`\`bash\n# See documentation for installation steps\n\`\`\``,
    '',
    `## Usage\n${studioSentences(chunks, /how to|usage|getting started|example/i, 2).map((s) => `- ${s}`).join('\n') || studioNF()}`,
    '',
    `## Contributing\nContributions welcome. Please open an issue or pull request.`,
    '',
    `## License\n_See document for licensing information._`,
    '',
    `---\n*Generated from retrieved knowledge chunks of _${docTitle}_.*`,
  ].join('\n');
}

function buildGraphicalReport(chunks: HybridSearchResult[]): string {
  const docTitle = chunks[0]?.title ?? 'the document';
  const years = mdocYears(chunks);
  const persons = mdocNames(chunks);
  const places = mdocPlaces(chunks);
  const yearRx = /\b(1[0-9]{3}|20[0-2][0-9])\b/;
  const timelineRows = studioSentences(chunks, yearRx, 10).map((s) => {
    const yr = s.match(yearRx)?.[0] ?? '';
    return `| ${yr} | ${s.slice(0, 140)} |`;
  });
  const numbers = [...chunks.map((c) => c.content).join('\n').matchAll(/\b(\d[\d,]*(?:\.\d+)?)\s*(%|million|billion|thousand|percent|km|km²|people|years?)\b/gi)]
    .slice(0, 10).map((m) => `| ${m[1]} ${m[2]} | See source |`);
  const causeRx = /because|led to|resulted in|caused|due to|therefore|consequently/i;

  return [
    `# Graphical Report: ${docTitle}`,
    `> Generated from **${chunks.length}** chunks. Use these tables in your charts and slides.`,
    '',
    studioSec('Key Statistics & Numbers',
      numbers.length > 0 ? '| Value | Context |\n|---|---|\n' + numbers.join('\n') : ''),
    '',
    studioSec('Timeline Data',
      timelineRows.length > 0 ? '| Year | Event |\n|---|---|\n' + timelineRows.join('\n') : ''),
    '',
    studioSec('People & Organizations',
      persons.length > 0 ? '| Name |\n|---|\n' + persons.map((n) => `| ${n} |`).join('\n') : ''),
    '',
    studioSec('Places & Locations',
      places.length > 0 ? '| Place |\n|---|\n' + places.map((p) => `| ${p} |`).join('\n') : ''),
    '',
    studioSec('Events Table',
      studioSentences(chunks, /war|battle|independence|election|treaty|movement|liberation/i, 8)
        .map((s, i) => `| ${i + 1} | ${s.slice(0, 140)} |`).length > 0
        ? '| # | Event |\n|---|---|\n' + studioSentences(chunks, /war|battle|independence|election|treaty|movement|liberation/i, 8).map((s, i) => `| ${i + 1} | ${s.slice(0, 140)} |`).join('\n')
        : ''),
    '',
    studioSec('Cause-Effect Map', studioSentences(chunks, causeRx, 5).map((s) => `- ${s}`).join('\n')),
    '',
    studioSec('Recommended Visualisations',
      [
        years.length > 2 ? `- **Timeline chart** — plot events by year: ${years.slice(0, 5).join(', ')}` : null,
        persons.length > 0 ? `- **Network graph** — show relationships between: ${persons.slice(0, 3).join(', ')}` : null,
        places.length > 0 ? `- **Map** — highlight locations: ${places.slice(0, 3).join(', ')}` : null,
        '- **Bar chart** — compare statistics from the evidence table',
      ].filter(Boolean).join('\n')),
  ].join('\n');
}

function buildTranscriptSummary(chunks: HybridSearchResult[]): string {
  const docTitle = chunks[0]?.title ?? 'the transcript';
  const topics = studioHeadings(chunks);
  const quotes = studioSentences(chunks, /"[^"]{20,}"|'[^']{20,}'/, 5);
  const actions = studioSentences(chunks, /should|must|will|need to|action|follow up|next step/i, 5);

  return [
    `# Transcript Summary: ${docTitle}`,
    `> Generated from **${chunks.length}** transcript chunks.`,
    '',
    studioSec('Executive Summary', studioSentences(chunks, undefined, 4).join(' ')),
    '',
    studioSec('Topics Covered', topics.length > 0 ? topics.slice(0, 8).map((t) => `- ${t}`).join('\n') : ''),
    '',
    studioSec('Key Moments', studioSentences(chunks, /important|key|critical|significant|highlight|moment/i, 6).map((s) => `- ${s}`).join('\n')),
    '',
    studioSec('Quotes & Highlights', quotes.length > 0 ? quotes.map((q) => `> ${q}`).join('\n\n') : ''),
    '',
    studioSec('Action Items', actions.length > 0 ? actions.map((a) => `- [ ] ${a}`).join('\n') : ''),
    '',
    studioSec('Conclusion', studioSentences(chunks.slice(-2), undefined, 2).join(' ')),
  ].join('\n');
}

function buildSceneBreakdown(chunks: HybridSearchResult[]): string {
  const docTitle   = chunks[0]?.title ?? 'the document';
  const persons    = mdocNames(chunks);
  const places     = mdocPlaces(chunks);
  const years      = mdocYears(chunks);
  const headings   = studioHeadings(chunks).filter((h) => h.length > 4 && !/^\d+$/.test(h));
  const sceneChunks = chunks.slice(0, 10);

  const sceneCards = sceneChunks.map((c, i) => {
    const heading  = c.content.split('\n').find((l) => /^#{1,3}\s/.test(l))?.replace(/^#+\s+/, '')
      ?? headings[i] ?? `Scene ${i + 1}`;
    const narSents = cleanSentences([c], undefined, 2);
    const narration = narSents.join(' ') || studioNF();
    const location  = places.find((p) => c.content.includes(p)) ?? places[0] ?? 'Location not specified';
    const chars     = persons.filter((p) => c.content.includes(p)).slice(0, 3);
    const yr        = (c.content.match(/\b(1[0-9]{3}|20[0-2][0-9])\b/) ?? [])[0];
    const visual    = presentationVisual(heading, persons, places, years);
    const duration  = Math.max(1, Math.ceil(narration.replace(studioNF(), '').length / 120));
    return [
      `## Scene ${i + 1}: ${heading}`,
      `**Location:** ${location}${yr ? `  ·  **Period:** ${yr}` : ''}`,
      `**Characters / Key Figures:** ${chars.length > 0 ? chars.join(', ') : 'Refer to source material'}`,
      `**Action:** ${narration.slice(0, 220)}`,
      `**Visual Idea:** ${visual}`,
      `**Est. Duration:** ~${duration} min`,
      `**Source Note:** _${c.title}_`,
    ].join('\n');
  });

  return [
    `# Scene Breakdown: ${docTitle}`,
    `> **${sceneChunks.length}** scenes grounded in **${chunks.length}** retrieved chunks`,
    ``,
    ...sceneCards.map((s) => s + '\n'),
  ].join('\n');
}

function buildVideoScript(chunks: HybridSearchResult[]): string {
  const docTitle   = chunks[0]?.title ?? 'the document';
  const persons    = mdocNames(chunks);
  const places     = mdocPlaces(chunks);
  const years      = mdocYears(chunks);
  const headings   = studioHeadings(chunks).filter((h) => h.length > 4 && !/^\d+$/.test(h));
  const allSents   = cleanSentences(chunks, undefined, 15);
  const hook       = allSents[0] ?? `What is _${docTitle}_ really about?`;

  const scenes = chunks.slice(0, 6).map((c, i) => {
    const heading   = c.content.split('\n').find((l) => /^#{1,3}\s/.test(l))?.replace(/^#+\s+/, '')
      ?? headings[i] ?? `Part ${i + 2}`;
    const narration = cleanSentences([c], undefined, 3)
      .map((s) => s.replace(/\*\*(.+?)\*\*/g, '$1').trim())
      .join(' ') || studioNF();
    const visual    = presentationVisual(heading, persons, places, years);
    const startSec  = (i + 1) * 30;
    return [
      `### Scene ${i + 2}: ${heading}`,
      `**Timestamp:** [${startSec}s – ${startSec + 30}s]`,
      `**Narration:** ${narration.slice(0, 280)}`,
      `**On-screen Text:** ${heading}`,
      `**Visual Direction:** ${visual}`,
      `**Source:** _${c.title}_`,
    ].join('\n');
  });

  const yearSpan = years.length > 1
    ? ` — a story spanning ${years[0]} to ${years[years.length - 1]}`
    : '';

  return [
    `# Video Script: ${docTitle}`,
    `> Script grounded in **${chunks.length}** retrieved chunks`,
    ``,
    `## Hook (0–15 seconds)`,
    `**Narration:** "${hook}"`,
    `**On-screen Text:** ${docTitle}`,
    `**Visual Direction:** ${places.length > 0 ? `Establishing shot: ${places[0]}` : `Eye-catching title card with subject imagery`}`,
    ``,
    `### Scene 1: Introduction`,
    `**Timestamp:** [15s – 30s]`,
    `**Narration:** Today we explore _${docTitle}_${yearSpan}.`,
    `**On-screen Text:** ${docTitle}`,
    `**Visual Direction:** Title card with subtitle`,
    ``,
    ...scenes.map((s) => s + '\n'),
    `## Full Narration Script`,
    allSents.slice(0, 10).map((s, i) => `> **[${i + 1}]** ${s}`).join('\n\n'),
    ``,
    `## Caption / On-screen Text`,
    allSents.slice(0, 5).map((s) => `[${s.slice(0, 90)}]`).join('\n'),
    ``,
    `## Ending & Call to Action (final 15 seconds)`,
    `**Narration:** That covers the key insights from _${docTitle}_. ${persons.length > 0 ? `Remember the stories of ${persons.slice(0, 2).join(' and ')}. ` : ''}If you found this useful, like and share.`,
    `**On-screen Text:** Key Takeaways`,
    `**Visual Direction:** Summary card with three bullet points`,
    ``,
    `---`,
    `*Script grounded entirely in retrieved content from _${docTitle}_.*`,
  ].join('\n');
}

function buildStoryboard(chunks: HybridSearchResult[]): string {
  const docTitle   = chunks[0]?.title ?? 'the document';
  const persons    = mdocNames(chunks);
  const places     = mdocPlaces(chunks);
  const years      = mdocYears(chunks);
  const headings   = studioHeadings(chunks).filter((h) => h.length > 4 && !/^\d+$/.test(h));
  const sceneChunks = chunks.slice(0, 10);

  const cards = sceneChunks.map((c, i) => {
    const heading   = c.content.split('\n').find((l) => /^#{1,3}\s/.test(l))?.replace(/^#+\s+/, '')
      ?? headings[i] ?? `Scene ${i + 1}`;
    const narration = cleanSentences([c], undefined, 1)[0] ?? studioNF();
    const graphic   = presentationVisual(heading, persons, places, years);
    return [
      `## Panel ${i + 1}: ${heading}`,
      `**Visual Idea:** ${graphic}`,
      `**Narration:** ${narration.slice(0, 200)}`,
      `**On-screen Text:** ${heading}`,
      `**Suggested Graphic:** ${graphic}`,
      `**Source Note:** _${c.title}_`,
    ].join('\n');
  });

  return [
    `# Storyboard: ${docTitle}`,
    `> **${sceneChunks.length}** panels grounded in **${chunks.length}** retrieved chunks`,
    ``,
    ...cards.map((c) => c + '\n'),
    `---`,
    `*All panels grounded in retrieved content from _${docTitle}_.*`,
  ].join('\n');
}

function buildVideoIntel(chunks: HybridSearchResult[]): string {
  const docTitle = chunks[0]?.title ?? 'the document';
  const persons  = mdocNames(chunks);
  const places   = mdocPlaces(chunks);
  const years    = mdocYears(chunks);
  const yearRx   = /\b(1[0-9]{3}|20[0-2][0-9])\b/;
  const headings = studioHeadings(chunks).filter((h) => h.length > 4 && !/^\d+$/.test(h));
  const allText  = chunks.map((c) => cleanChunkContent(c.content)).join('\n\n');
  const src      = `_${docTitle}_`;

  // ── Entities ──────────────────────────────────────────────────────────────
  const orgs: string[] = [];
  for (const m of allText.matchAll(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:Organization|Organisation|Institute|University|College|Ministry|Government|Party|League|Council|Committee|Commission|Foundation|Corps|Force|Army)\b/g,
  )) {
    if (orgs.length >= 6) break;
    orgs.push(m[0].trim().slice(0, 60));
  }

  // ── Sentence pools ─────────────────────────────────────────────────────────
  const summary    = cleanSentences(chunks, undefined, 4).join(' ') || studioNF();
  const mainTopic  = headings[0] ?? docTitle;
  const keyMoments = cleanSentences(
    chunks, /important|key|critical|significant|highlight|major|turning point|milestone/i, 6,
  );
  const timelineItems = cleanSentences(chunks, yearRx, 8).map((s) => {
    const yr = s.match(yearRx)?.[0] ?? '?';
    return `- **${yr}**: ${s.slice(0, 180)}`;
  });

  // ── Scene breakdown ────────────────────────────────────────────────────────
  const scenes = chunks.slice(0, 8).map((c, i) => {
    const heading = c.content.split('\n').find((l) => /^#{1,3}\s/.test(l))?.replace(/^#+\s+/, '')
      ?? headings[i] ?? `Segment ${i + 1}`;
    const narration = cleanSentences([c], undefined, 1)[0] ?? studioNF();
    return `- **Scene ${i + 1} — ${heading}:** ${narration.slice(0, 160)}`;
  });

  // ── Narration samples ──────────────────────────────────────────────────────
  const narrations = cleanSentences(chunks, undefined, 6);

  // ── Visual direction ───────────────────────────────────────────────────────
  const visuals = [
    persons.length > 0 ? `Portrait or profile cards for ${persons.slice(0, 3).join(', ')}` : null,
    places.length > 0 ? `Map overlay highlighting ${places.slice(0, 3).join(', ')}` : null,
    years.length > 2 ? `Animated timeline from ${years[0]} to ${years[years.length - 1]}` : null,
    headings.length > 0 ? `Title cards for each segment: "${headings.slice(0, 3).join('", "')}"` : null,
    `B-roll: contextual footage or archival imagery matching each scene topic`,
  ].filter(Boolean) as string[];

  // ── Short-form ideas ───────────────────────────────────────────────────────
  const shortIdeas = [
    keyMoments[0] ? `60-second explainer: "${keyMoments[0].slice(0, 100)}"` : null,
    persons.length > 0 ? `Quick-bio reel: Who was ${persons[0]}?` : null,
    years.length > 0 ? `"Did you know?" clip about events in ${years[0]}` : null,
    places.length > 0 ? `Location spotlight: ${places[0]}` : null,
    `Key quote card pulled from ${src}`,
  ].filter(Boolean) as string[];

  // ── Long-form ideas ────────────────────────────────────────────────────────
  const longIdeas = [
    `Full documentary: "${docTitle} — A Complete Overview"`,
    headings.length > 1
      ? `Multi-part series: one episode per theme (${headings.slice(0, 3).join(', ')})`
      : null,
    persons.length > 0 ? `Biography episode: The story of ${persons[0]}` : null,
    `Deep-dive explainer: background, evidence, implications, and conclusions from ${src}`,
    `Panel-discussion video based on the key arguments and evidence`,
  ].filter(Boolean) as string[];

  // ── B-roll suggestions ─────────────────────────────────────────────────────
  const broll = [
    places.length > 0 ? `Aerial or establishing shots: ${places.slice(0, 3).join(', ')}` : null,
    persons.length > 0 ? `Archive photos or illustrations: ${persons.slice(0, 3).join(', ')}` : null,
    years.length > 0
      ? `Period-era footage or photographs from ${years[0]}${years.length > 1 ? `–${years[years.length - 1]}` : ''}`
      : null,
    `Documents, maps, or source materials referenced in ${src}`,
    headings.length > 0 ? `Graphic title cards for: "${headings.slice(0, 3).join('", "')}"` : null,
  ].filter(Boolean) as string[];

  // ── Knowledge graph summary ────────────────────────────────────────────────
  const kgEntities = [
    persons.length > 0 ? `**People (${persons.length}):** ${persons.slice(0, 6).join(', ')}` : null,
    places.length > 0 ? `**Places (${places.length}):** ${places.slice(0, 6).join(', ')}` : null,
    orgs.length > 0 ? `**Organisations (${orgs.length}):** ${orgs.slice(0, 4).join(', ')}` : null,
    years.length > 0 ? `**Key Years (${years.length}):** ${years.slice(0, 6).join(', ')}` : null,
    headings.length > 0 ? `**Concepts (${headings.length}):** ${headings.slice(0, 5).join(', ')}` : null,
  ].filter(Boolean) as string[];

  const firstSent = cleanSentences(chunks, undefined, 1)[0] ?? studioNF();

  return [
    `# Video Intelligence Report: ${docTitle}`,
    `> Analysed **${chunks.length}** chunks · ${persons.length} people · ${places.length} locations · ${years.length} dates`,
    ``,
    studioSec('Video / Transcript Summary', summary),
    ``,
    studioSec(
      'Main Topic',
      `**${mainTopic}**` +
      (headings.length > 1 ? `\n\n**Sub-topics:** ${headings.slice(1, 5).join(' · ')}` : ''),
    ),
    ``,
    studioSec(
      'Key Moments',
      keyMoments.length > 0
        ? keyMoments.map((s) => `- ${s.slice(0, 200)}`).join('\n')
        : '',
    ),
    ``,
    studioSec(
      'Important People & Organizations',
      [
        persons.length > 0 ? `**People:** ${persons.slice(0, 8).join(', ')}` : null,
        orgs.length > 0 ? `**Organisations:** ${orgs.slice(0, 5).join(', ')}` : null,
      ].filter(Boolean).join('\n\n'),
    ),
    ``,
    studioSec(
      'Important Places',
      places.length > 0 ? places.slice(0, 8).map((p) => `- ${p}`).join('\n') : '',
    ),
    ``,
    studioSec(
      'Important Dates & Timeline',
      timelineItems.length > 0 ? timelineItems.join('\n') : '',
    ),
    ``,
    studioSec('Scene Breakdown', scenes.join('\n')),
    ``,
    studioSec(
      'Speaker / Narration Notes',
      narrations.length > 0
        ? narrations.map((s, i) => `**[${i + 1}]** ${s}`).join('\n\n')
        : '',
    ),
    ``,
    studioSec('Visual Direction', visuals.map((v) => `- ${v}`).join('\n')),
    ``,
    studioSec('Short-form Content Ideas (Social / Clips)', shortIdeas.map((v) => `- ${v}`).join('\n')),
    ``,
    studioSec('Long-form Content Ideas (Documentary / Series)', longIdeas.map((v) => `- ${v}`).join('\n')),
    ``,
    studioSec('Suggested B-roll & Graphics', broll.map((v) => `- ${v}`).join('\n')),
    ``,
    studioSec('Knowledge Graph Entities', kgEntities.join('\n')),
    ``,
    studioSec(
      'Final Media Brief',
      `**Subject:** ${docTitle}\n` +
      `**Format:** Multi-scene video or documentary\n` +
      `**Audience:** General public / researchers\n` +
      `**Tone:** Informative, factual, grounded in source material\n` +
      `**Key Message:** ${firstSent}\n` +
      `**Source:** ${src}`,
    ),
  ].join('\n');
}

function buildKnowledgeGraph(chunks: HybridSearchResult[]): string {
  const docTitle = chunks[0]?.title ?? 'the document';
  const persons = mdocNames(chunks);
  const places = mdocPlaces(chunks);
  const years = mdocYears(chunks);
  const headings = studioHeadings(chunks);
  const allText = chunks.map((c) => c.content).join('\n\n');

  const orgs: string[] = [];
  for (const m of allText.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\s+(?:Organization|Organisation|Institute|University|College|Ministry|Government|Party|League|Council|Committee|Commission|Foundation)/g)) {
    orgs.push(m[0].replace(/\*\*(.+?)\*\*/g, '$1').trim().slice(0, 60));
    if (orgs.length >= 8) break;
  }

  const freqTable = [...new Set([...persons, ...places, ...headings])].slice(0, 10).map((entity) => {
    const count = (allText.match(new RegExp(entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) ?? []).length;
    return `| ${entity} | ${count} |`;
  });

  return [
    `# Knowledge Graph: ${docTitle}`,
    `> Entity extraction from **${chunks.length}** retrieved chunks.`,
    '',
    studioSec('Person Entities', persons.length > 0 ? persons.map((p) => `- **Person**: ${p}`).join('\n') : ''),
    '',
    studioSec('Place Entities', places.length > 0 ? places.map((p) => `- **Place**: ${p}`).join('\n') : ''),
    '',
    studioSec('Organisation Entities', orgs.length > 0 ? orgs.map((o) => `- **Org**: ${o}`).join('\n') : ''),
    '',
    studioSec('Date / Time Entities', years.length > 0 ? years.map((y) => `- **Year**: ${y}`).join('\n') : ''),
    '',
    studioSec('Concept Entities', headings.length > 0 ? headings.slice(0, 10).map((h) => `- **Concept**: ${h}`).join('\n') : ''),
    '',
    studioSec('Entity Frequency Table',
      freqTable.length > 0 ? '| Entity | Mentions |\n|---|---|\n' + freqTable.join('\n') : ''),
    '',
    studioSec('Graph Summary',
      `${persons.length} persons · ${places.length} places · ${orgs.length} orgs · ${years.length} dates · ${headings.length} concepts`),
  ].join('\n');
}

function buildStudioWorkflowReport(workflow: StudioWorkflow, chunks: HybridSearchResult[]): string {
  switch (workflow) {
    case 'study-pack':        return buildStudyPack(chunks);
    case 'action-items':      return buildActionItems(chunks);
    case 'presentation':      return buildPresentation(chunks);
    case 'blog-post':         return buildBlogPost(chunks);
    case 'linkedin':          return buildLinkedIn(chunks);
    case 'github-readme':     return buildGitHubReadme(chunks);
    case 'graphical-report':  return buildGraphicalReport(chunks);
    case 'transcript-summary':return buildTranscriptSummary(chunks);
    case 'scene-breakdown':   return buildSceneBreakdown(chunks);
    case 'video-script':      return buildVideoScript(chunks);
    case 'storyboard':        return buildStoryboard(chunks);
    case 'video-intel':       return buildVideoIntel(chunks);
    case 'knowledge-graph':   return buildKnowledgeGraph(chunks);
  }
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

  // Rerank — research/compare/debate/studio modes get more chunks for richer coverage.
  const isMultiDocMode = isCompareDocuments(query) || isDebateMode(query);
  const isStructuredMode = isAutoResearchReport(query) || isMultiDocMode || detectStudioWorkflow(query) !== null;
  const rerankCount = isStructuredMode ? 8 : 5;
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

    if (isCompareDocuments(query)) {
      console.info('[aivora-agent] Compare Documents detected — building deterministic comparison report.');
      const report = buildComparisonReport(topChunks);
      return {
        answer: report,
        reasoningTrace: {
          ...baseTrace,
          reflection: `Document comparison generated from ${topChunks.length} chunk(s) across ${groupByDocument(topChunks).length} document(s).`,
        },
        citations,
        confidence: Math.max(Math.round(reflection.confidence * 100) / 100, 0.65),
        needsMoreContext: false,
        needsLocalLLM: false,
        retrievedContext,
      };
    }

    if (isDebateMode(query)) {
      console.info('[aivora-agent] Debate Mode detected — building deterministic debate report.');
      const report = buildDebateReport(topChunks);
      return {
        answer: report,
        reasoningTrace: {
          ...baseTrace,
          reflection: `Debate analysis generated from ${topChunks.length} chunk(s) across ${groupByDocument(topChunks).length} document(s).`,
        },
        citations,
        confidence: Math.max(Math.round(reflection.confidence * 100) / 100, 0.65),
        needsMoreContext: false,
        needsLocalLLM: false,
        retrievedContext,
      };
    }

    const studioWorkflow = detectStudioWorkflow(query);
    if (studioWorkflow !== null) {
      console.info(`[aivora-agent] Studio workflow "${studioWorkflow}" detected — building deterministic output.`);
      const report = buildStudioWorkflowReport(studioWorkflow, topChunks);
      return {
        answer: report,
        reasoningTrace: {
          ...baseTrace,
          reflection: `Studio workflow "${studioWorkflow}" generated from ${topChunks.length} chunk(s) deterministically.`,
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
