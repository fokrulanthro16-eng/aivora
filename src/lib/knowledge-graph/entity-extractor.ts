/**
 * Knowledge Graph — deterministic entity extractor
 *
 * Extracts People, Places, Dates, Events, and Concepts from citation text
 * using regex heuristics.  No external API or LLM required.
 *
 * Outputs a list of KnowledgeEntity nodes and co-occurrence KnowledgeEdges
 * suitable for rendering with React Flow.
 */

import type { SourceCitation } from '@/lib/types/citation';

// ── Public types ──────────────────────────────────────────────────────────────

export type EntityType = 'person' | 'place' | 'date' | 'event' | 'concept';

export type KnowledgeEntity = {
  id: string;
  label: string;
  type: EntityType;
  frequency: number;
};

export type KnowledgeEdge = {
  id: string;
  source: string;
  target: string;
};

export type KnowledgeGraph = {
  entities: KnowledgeEntity[];
  edges: KnowledgeEdge[];
  sourceLabel: string;
};

// ── Stop-word filter ──────────────────────────────────────────────────────────

// Capitalized words that are never meaningful entities.
const STOP_CAPS = new Set([
  'The', 'This', 'That', 'These', 'Those', 'A', 'An',
  'His', 'Her', 'Its', 'Their', 'Our', 'Your', 'My',
  'Each', 'Every', 'Some', 'Many', 'Most', 'All', 'Any', 'Other',
  'First', 'Last', 'Next', 'Then', 'Also', 'Thus',
  'New', 'Old', 'Big', 'Little', 'Great', 'High', 'Low', 'Long',
  'However', 'Although', 'Therefore', 'Furthermore', 'Moreover',
  'According', 'Additionally', 'Subsequently', 'Previously',
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
]);

function isStop(label: string): boolean {
  const first = label.split(/\s+/)[0] ?? '';
  return STOP_CAPS.has(first) || label.length < 2 || label.length > 55;
}

// ── Regex helper ──────────────────────────────────────────────────────────────

function scan(text: string, pattern: string, groupIdx = 1): string[] {
  const re = new RegExp(pattern, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const v = m[groupIdx]?.trim() ?? '';
    if (v.length >= 2 && v.length <= 55) out.push(v);
  }
  return out;
}

// ── Individual extractors ─────────────────────────────────────────────────────

function extractPeople(text: string): string[] {
  return [
    // Title-prefixed names
    ...scan(
      text,
      String.raw`\b(?:Mr\.?|Mrs\.?|Ms\.?|Dr\.?|Prof\.?|President|Prime Minister|Secretary|General|Admiral|Senator|Governor|Director|CEO|Chairman|Chancellor|Minister|Lord|Sir|Dame)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})`,
      1,
    ),
    // Attribution patterns: "by / founded by / written by Name"
    ...scan(
      text,
      String.raw`\b(?:by|authored? by|founded by|led by|written by|created by|invented by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})`,
      1,
    ),
  ];
}

function extractPlaces(text: string): string[] {
  const raw = [
    // After common location prepositions
    ...scan(
      text,
      String.raw`\b(?:in|at|from|near|to|across|throughout|within|outside|around)\s+(?:the\s+)?([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2})`,
      1,
    ),
    // Before geographic suffixes
    ...scan(
      text,
      String.raw`\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:City|State|Province|County|District|Region|Territory|Republic|Kingdom|Empire|Island|Ocean|Sea|River|Lake|Mountain|Bay|Gulf|Peninsula|Forest|Desert|Valley)`,
      1,
    ),
  ];
  return raw.filter((v) => !isStop(v));
}

function extractDates(text: string): string[] {
  return [
    // Full dates: "January 15, 2023"
    ...scan(
      text,
      String.raw`\b((?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})`,
      1,
    ),
    // Year alone: 1600–2099
    ...scan(text, String.raw`\b(1[6-9]\d{2}|20\d{2})\b`, 1),
    // Decade: "the 1990s", "the 20th century"
    ...scan(text, String.raw`\b(the\s+\d{4}s|the\s+\d{2}(?:st|nd|rd|th)\s+century)`, 1),
  ];
}

function extractEvents(text: string): string[] {
  const raw = scan(
    text,
    String.raw`\b(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:War|Wars|Battle|Revolution|Conference|Summit|Crisis|Treaty|Agreement|Declaration|Movement|Campaign|Uprising|Rebellion|Coup|Election|Olympics|Games|Act|Reform|Policy|Accord|Protocol)`,
    1,
  );
  return raw.filter((v) => !isStop(v));
}

function extractConcepts(text: string): string[] {
  const raw = [
    // Bold markdown: **Term**
    ...scan(text, String.raw`\*\*([^*\n]{2,50})\*\*`, 1),
    // Backtick terms: `term`
    ...scan(text, String.raw`\x60([^\x60\n]{2,40})\x60`, 1),
  ];
  return raw.filter((v) => !isStop(v));
}

// ── Frequency deduplication ───────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40).replace(/^_|_$/g, '');
}

function toEntities(
  raw: string[],
  type: EntityType,
  maxN: number,
): KnowledgeEntity[] {
  const freq = new Map<string, number>();
  const label = new Map<string, string>();

  for (const item of raw) {
    const key = item.toLowerCase().trim();
    freq.set(key, (freq.get(key) ?? 0) + 1);
    if (!label.has(key)) label.set(key, item.trim());
  }

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxN)
    .map(([key, frequency]) => {
      const lbl = label.get(key) ?? key;
      return {
        id:        `${type}:${slugify(lbl)}`,
        label:     lbl.length > 26 ? lbl.slice(0, 24) + '…' : lbl,
        type,
        frequency,
      };
    });
}

// ── Co-occurrence edges ───────────────────────────────────────────────────────

function coOccurrenceEdges(
  entities: KnowledgeEntity[],
  citations: SourceCitation[],
): KnowledgeEdge[] {
  const edges: KnowledgeEdge[] = [];
  const seen = new Set<string>();

  for (const c of citations) {
    const chunk = `${c.documentTitle} ${c.quotedText}`.toLowerCase();
    // Entity is "present" in the chunk if its first 12 chars appear in the text.
    const present = entities.filter((e) =>
      chunk.includes(e.label.replace('…', '').toLowerCase().slice(0, 12)),
    );

    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const a = present[i]!.id;
        const b = present[j]!.id;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ id: `kg:${key}`, source: a, target: b });
        }
      }
    }
  }

  return edges;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildKnowledgeGraph(citations: SourceCitation[]): KnowledgeGraph {
  if (citations.length === 0) {
    return { entities: [], edges: [], sourceLabel: '' };
  }

  const allText = citations.map((c) => `${c.documentTitle}\n${c.quotedText}`).join('\n\n');
  const sourceLabel = citations[0]?.documentTitle ?? 'Knowledge Base';

  const entities: KnowledgeEntity[] = [
    ...toEntities(extractPeople(allText),   'person',  5),
    ...toEntities(extractPlaces(allText),   'place',   4),
    ...toEntities(extractDates(allText),    'date',    4),
    ...toEntities(extractEvents(allText),   'event',   3),
    ...toEntities(extractConcepts(allText), 'concept', 5),
  ];

  const edges = coOccurrenceEdges(entities, citations);

  return { entities, edges, sourceLabel };
}
