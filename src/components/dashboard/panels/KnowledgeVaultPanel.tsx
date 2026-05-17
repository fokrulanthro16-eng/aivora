'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload, CheckCircle, AlertCircle, Loader2, HardDrive,
  RefreshCw, FileText, Trash2, Eye, RotateCw, X, Search,
  ChevronDown, BrainCircuit, Image as ImageIcon,
  Square, CheckSquare, GitCompare, Swords,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

// ── Types ─────────────────────────────────────────────────────────────────────

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading' }
  | { status: 'success'; fileName: string; fileType: string; chunksInserted: number }
  | { status: 'error'; message: string };

type DocRow = {
  id: string;
  title: string;
  fileName: string | null;
  fileType: string;
  chunksCount: number;
  createdAt: string;
};

type DocsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; docs: DocRow[] }
  | { status: 'error'; message: string };

type ChunkRow = { index: number; content: string; tokenCount: number | null };

type ChunksModal =
  | { open: false }
  | { open: true; docTitle: string; chunks: ChunkRow[]; loading: boolean; error?: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const FILE_TYPE_LABEL: Record<string, string> = {
  txt: 'TXT', markdown: 'MD', pdf: 'PDF', docx: 'DOCX', image: 'IMAGE', transcript: 'SRT/VTT',
};

type DocAction = { label: string; prompt: (title: string) => string };

const QUICK_ACTIONS: DocAction[] = [
  { label: 'Summarize',  prompt: ()      => 'Summarize this document in clear bullet points.' },
  { label: 'Key Points', prompt: ()      => 'What are the key points and main takeaways?' },
  { label: 'Timeline',   prompt: ()      => 'Extract a chronological timeline of events or milestones.' },
  { label: 'FAQ',        prompt: ()      => 'Generate a FAQ with 5 questions and answers based on this content.' },
  { label: 'Quiz',       prompt: ()      => 'Create a 5-question quiz with answers based on this content.' },
  { label: 'Ask',        prompt: (title) => `What is "${title}" about? Give me an overview of its main topics.` },
];

const DEEP_ACTIONS: DocAction[] = [
  { label: 'Study Notes',     prompt: () => 'Create structured study notes with key concepts, definitions, and important points from this document.' },
  { label: 'Key People',      prompt: () => 'List all key people, authors, organisations, or entities mentioned in this document with a brief description of each.' },
  { label: 'Key Dates',       prompt: () => 'Extract all important dates, events, and deadlines mentioned in this document in chronological order.' },
  { label: 'Key Places',      prompt: () => 'List all important locations, places, or geographic references mentioned in this document.' },
  { label: 'Chapter Summary', prompt: () => 'Provide a section-by-section or chapter-by-chapter summary of this document.' },
  { label: 'Explain Simply',  prompt: () => 'Explain the main content of this document in plain language that anyone can understand, avoiding jargon.' },
  { label: 'Exam Questions',  prompt: () => 'Generate 10 exam-style questions with answers covering the key content of this document.' },
];

function compareDocumentsPrompt(docs: DocRow[]): string {
  const titles = docs.map((d, i) => `Document ${String.fromCharCode(65 + i)}: "${d.title}"`).join('\n');
  return (
    `Compare the following selected documents:\n${titles}\n\n` +
    `Use only content from the selected documents. Do not invent facts. Cite sources from each document.\n\n` +
    `## Executive Comparison Summary\n` +
    `## Similarities\n` +
    `## Differences\n` +
    `## Contradictions or Conflicting Claims\n` +
    `## Timeline Comparison\n` +
    `## People / Organizations Comparison\n` +
    `## Places Comparison\n` +
    `## Key Concepts Comparison\n` +
    `## Evidence Table\n` +
    `## Source-backed Findings\n` +
    `## Final Comparative Brief\n\n` +
    `Format with markdown headings (##). Use tables where appropriate. Ground all answers in the selected documents only.`
  );
}

function debateModePrompt(docs: DocRow[]): string {
  const titles = docs.map((d, i) => `Document ${String.fromCharCode(65 + i)}: "${d.title}"`).join('\n');
  const positionSections = docs.map((_, i) => `## Position of Document ${String.fromCharCode(65 + i)}`).join('\n');
  return (
    `Create a structured academic debate between the following selected documents:\n${titles}\n\n` +
    `Use only content from the selected documents. Do not invent facts. Cite sources.\n\n` +
    `${positionSections}\n` +
    `## Evidence from Each Document\n` +
    `## Strongest Arguments\n` +
    `## Weakest Arguments\n` +
    `## Points of Agreement\n` +
    `## Points of Disagreement\n` +
    `## Neutral Judge Summary\n` +
    `## Final Verdict\n\n` +
    `Format with markdown headings (##). Ground all debate points in the selected documents only.`
  );
}

function autoResearchPrompt(title: string, fileName: string): string {
  return (
    `Based only on the document "${title}" (file: "${fileName}"), create a complete autonomous research report. ` +
    `Format each section with a clear markdown heading (##). ` +
    `If information for a section is not present in the document, write exactly: "Not found in the selected document." ` +
    `Do not invent facts, people, dates, places, events, or citations.\n\n` +
    `## Executive Summary\n` +
    `## Key Points\n` +
    `## Timeline of Events\n` +
    `## Important People\n` +
    `## Important Places\n` +
    `## Important Dates\n` +
    `## Important Events\n` +
    `## Core Concepts\n` +
    `## Cause and Effect\n` +
    `## Chapter / Section Breakdown\n` +
    `## Key Terms Glossary\n` +
    `## Study Notes\n` +
    `## Exam Questions (10 with model answers)\n` +
    `## Quiz with Answers (5 multiple-choice questions)\n` +
    `## FAQ (5 questions with answers)\n` +
    `## Contradictions or Unclear Claims\n` +
    `## Source-backed Evidence Table\n` +
    `## Knowledge Graph Entities\n` +
    `## Recommended Follow-up Questions\n` +
    `## Image / Text Extraction Notes\n` +
    `## Media Intelligence Notes\n` +
    `## Final Research Brief\n\n` +
    `Use bullet points and tables where appropriate. Cite specific content from the document. ` +
    `Ground all answers in the selected document only.`
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  className?: string;
  onAction?: (query: string, documentId?: string) => void;
  onMultiAction?: (query: string, documentIds: string[]) => void;
};

export function KnowledgeVaultPanel({ className, onAction, onMultiAction }: Props) {
  const [uploadState, setUploadState]         = useState<UploadState>({ status: 'idle' });
  const [docsState, setDocsState]             = useState<DocsState>({ status: 'idle' });
  const [title, setTitle]                     = useState('');
  const [search, setSearch]                   = useState('');
  const [deletingId, setDeletingId]           = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [chunksModal, setChunksModal]         = useState<ChunksModal>({ open: false });
  const [expandedCardId, setExpandedCardId]   = useState<string | null>(null);
  const [reportSentId, setReportSentId]       = useState<string | null>(null);
  const [selectedIds, setSelectedIds]         = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Fetch documents ──────────────────────────────────────────────────────────

  const fetchDocs = useCallback(async () => {
    setDocsState({ status: 'loading' });
    try {
      const res  = await fetch('/api/documents');
      const data = (await res.json()) as { ok?: boolean; documents?: DocRow[]; error?: string };
      if (!res.ok || !data.ok) {
        setDocsState({ status: 'error', message: data.error ?? 'Failed to load documents.' });
      } else {
        setDocsState({ status: 'ready', docs: data.documents ?? [] });
      }
    } catch {
      setDocsState({ status: 'error', message: 'Network error loading documents.' });
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchDocs(); }, [fetchDocs]);

  // ── Delete ───────────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setDeletingId(id);
    setConfirmDeleteId(null);
    try {
      const res  = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        console.error('[KnowledgeVaultPanel] Delete failed:', data.error);
      }
    } catch {
      // Refresh regardless — let the list reflect server state.
    } finally {
      setDeletingId(null);
      void fetchDocs();
    }
  }

  // ── View chunks ──────────────────────────────────────────────────────────────

  async function handleViewChunks(id: string, docTitle: string) {
    setChunksModal({ open: true, docTitle, chunks: [], loading: true });
    try {
      const res  = await fetch(`/api/documents/${id}/chunks`);
      const data = (await res.json()) as { ok?: boolean; chunks?: ChunkRow[]; error?: string };
      if (!res.ok || !data.ok) {
        setChunksModal({ open: true, docTitle, chunks: [], loading: false, error: data.error ?? 'Failed to load chunks.' });
      } else {
        setChunksModal({ open: true, docTitle, chunks: data.chunks ?? [], loading: false });
      }
    } catch {
      setChunksModal({ open: true, docTitle, chunks: [], loading: false, error: 'Network error.' });
    }
  }

  // ── Upload ───────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploadState({ status: 'uploading' });
    const form = new FormData();
    form.append('file', file);
    if (title.trim()) form.append('title', title.trim());

    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', body: form });
      let data: { ok?: boolean; error?: string; fileName?: string; fileType?: string; chunksInserted?: number };
      try {
        data = (await res.json()) as typeof data;
      } catch {
        const text = await res.text().catch(() => '');
        setUploadState({
          status: 'error',
          message: text
            ? `Server error: ${text.slice(0, 200)}`
            : `HTTP ${res.status} — unexpected response format`,
        });
        return;
      }

      if (!res.ok || data.ok === false) {
        setUploadState({ status: 'error', message: data.error ?? `Upload failed (HTTP ${res.status}).` });
      } else {
        setUploadState({
          status: 'success',
          fileName:       data.fileName      ?? file.name,
          fileType:       data.fileType      ?? 'txt',
          chunksInserted: data.chunksInserted ?? 0,
        });
        setTitle('');
        if (fileRef.current) fileRef.current.value = '';
        void fetchDocs();
      }
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : 'Network error';
      setUploadState({ status: 'error', message: `Network error — ${msg}. Is the dev server running?` });
    }
  }

  // ── Multi-select helpers ─────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function handleCompare() {
    if (selectedIds.length < 2) return;
    const selectedDocs = allDocs.filter((d) => selectedIds.includes(d.id));
    onMultiAction?.(compareDocumentsPrompt(selectedDocs), selectedIds);
    setSelectedIds([]);
    setReportSentId(null);
  }

  function handleDebate() {
    if (selectedIds.length < 2) return;
    const selectedDocs = allDocs.filter((d) => selectedIds.includes(d.id));
    onMultiAction?.(debateModePrompt(selectedDocs), selectedIds);
    setSelectedIds([]);
    setReportSentId(null);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso.slice(0, 10);
    }
  }

  function fileTypeIcon(fileType: string) {
    if (fileType === 'image') return <ImageIcon className="w-3.5 h-3.5 text-violet-400/50 shrink-0 mt-0.5" />;
    return <FileText className="w-3.5 h-3.5 text-cyan-400/50 shrink-0 mt-0.5" />;
  }

  const allDocs      = docsState.status === 'ready' ? docsState.docs : [];
  const totalChunks  = allDocs.reduce((s, d) => s + d.chunksCount, 0);
  const filteredDocs = search.trim()
    ? allDocs.filter(
        (d) =>
          d.title.toLowerCase().includes(search.toLowerCase()) ||
          (d.fileName ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : allDocs;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0 border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <HardDrive className="w-3.5 h-3.5 text-cyan-400/70 flex-shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400/80 flex-shrink-0">
            Knowledge Vault
          </span>
          {docsState.status === 'ready' && (
            <span className="text-[9px] font-mono text-white/25 truncate">
              {allDocs.length} doc{allDocs.length !== 1 ? 's' : ''} · {totalChunks} chunk{totalChunks !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => void fetchDocs()}
            title="Refresh document list"
            className="text-white/20 hover:text-cyan-400/60 transition-colors"
          >
            <RefreshCw className={cn('w-3 h-3', docsState.status === 'loading' && 'animate-spin')} />
          </button>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-400/20">
            <span className="text-[9px] font-mono text-cyan-300">pgvector</span>
          </div>
        </div>
      </div>

      {/* ── Compare Bar — fixed below header, never scrolls away ── */}
      <AnimatePresence>
        {selectedIds.length >= 1 && onMultiAction && (
          <motion.div
            key="compare-bar"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="flex-shrink-0 overflow-hidden border-b border-cyan-400/15"
          >
            <div className="px-4 py-3 bg-gradient-to-r from-cyan-500/8 via-violet-500/5 to-cyan-500/8 space-y-2.5">

              {/* Bar header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                    animate={{ opacity: [1, 0.4, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <span className="text-[10px] font-mono font-semibold text-cyan-300">
                    {selectedIds.length} document{selectedIds.length !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <button
                  onClick={() => setSelectedIds([])}
                  title="Clear selection"
                  className="text-white/25 hover:text-white/60 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>

              {/* Selected document labels */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {allDocs
                  .filter((d) => selectedIds.includes(d.id))
                  .map((d, i) => (
                    <div key={d.id} className="flex items-center gap-1">
                      <span className="text-[8px] font-mono text-cyan-400/60 font-bold">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-[9px] font-mono text-white/40 max-w-[120px] truncate">
                        {d.title}
                      </span>
                      {d.chunksCount === 0 && (
                        <span className="text-[8px] font-mono text-amber-400/60">(no chunks)</span>
                      )}
                    </div>
                  ))}
              </div>

              {/* Chunk warning */}
              {allDocs.filter((d) => selectedIds.includes(d.id)).some((d) => d.chunksCount === 0) && (
                <div className="flex items-center gap-1.5 rounded-lg bg-amber-500/8 border border-amber-400/15 px-2 py-1">
                  <AlertCircle className="w-3 h-3 text-amber-400/60 flex-shrink-0" />
                  <span className="text-[9px] font-mono text-amber-300/60">
                    A selected document has no indexed chunks.
                  </span>
                </div>
              )}

              {/* Action buttons — enabled only when ≥2 selected */}
              {selectedIds.length < 2 ? (
                <p className="text-[9px] font-mono text-white/30 text-center pb-0.5">
                  Select at least 2 documents to compare
                </p>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleCompare}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                      bg-cyan-500/15 border border-cyan-400/30 text-cyan-300
                      hover:bg-cyan-500/25 hover:border-cyan-400/50
                      transition-all duration-150 text-[10px] font-mono font-semibold"
                  >
                    <GitCompare className="w-3.5 h-3.5 flex-shrink-0" />
                    Compare Documents
                  </button>
                  <button
                    onClick={handleDebate}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl
                      bg-violet-500/15 border border-violet-400/30 text-violet-300
                      hover:bg-violet-500/25 hover:border-violet-400/50
                      transition-all duration-150 text-[10px] font-mono font-semibold"
                  >
                    <Swords className="w-3.5 h-3.5 flex-shrink-0" />
                    Debate Mode
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 custom-scrollbar">

        {/* ── Document Library ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              Indexed Documents
            </span>
            {docsState.status === 'ready' && allDocs.length > 0 && (
              <span className="text-[9px] font-mono text-white/20">
                {filteredDocs.length === allDocs.length
                  ? `${allDocs.length} file${allDocs.length !== 1 ? 's' : ''}`
                  : `${filteredDocs.length} / ${allDocs.length}`}
              </span>
            )}
          </div>

          {/* Search */}
          {docsState.status === 'ready' && allDocs.length > 0 && (
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/20 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by title or file name…"
                className="w-full bg-white/4 border border-white/8 rounded-xl pl-7 pr-7 py-1.5
                  text-[10px] text-white/60 placeholder-white/20
                  focus:outline-none focus:border-cyan-400/25 transition-colors"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          {/* Loading */}
          {docsState.status === 'loading' && (
            <div className="flex items-center justify-center gap-2 py-5">
              <Loader2 className="w-3.5 h-3.5 text-cyan-400/40 animate-spin" />
              <span className="text-[10px] text-white/25 font-mono">Loading…</span>
            </div>
          )}

          {/* Error */}
          {docsState.status === 'error' && (
            <div className="flex items-center gap-2 bg-red-500/8 border border-red-500/15 rounded-xl p-3">
              <AlertCircle className="w-3.5 h-3.5 text-red-400/60 shrink-0" />
              <p className="text-red-300/70 text-[10px]">{docsState.message}</p>
            </div>
          )}

          {/* Empty */}
          {docsState.status === 'ready' && filteredDocs.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <FileText className="w-6 h-6 text-white/10" />
              <p className="text-[10px] text-white/25 leading-relaxed">
                {allDocs.length === 0
                  ? <><span>No documents indexed yet.</span><br /><span>Upload a file below to get started.</span></>
                  : 'No documents match your search.'}
              </p>
            </div>
          )}

          {/* Document cards */}
          {docsState.status === 'ready' && filteredDocs.length > 0 && (
            <div className="space-y-2">
              {filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  className={cn(
                    'rounded-xl p-3 space-y-2.5 transition-all duration-200',
                    selectedIds.includes(doc.id)
                      ? 'bg-cyan-500/[0.04] border border-cyan-400/30 shadow-[0_0_14px_rgba(34,211,238,0.07)]'
                      : 'bg-white/[0.03] border border-white/8',
                  )}
                >
                  {/* Top row */}
                  <div className="flex items-start gap-2">
                    {fileTypeIcon(doc.fileType)}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-white/80 font-medium truncate leading-snug">
                        {doc.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className={cn(
                          'text-[9px] font-mono uppercase',
                          doc.fileType === 'image' ? 'text-violet-400/60' : 'text-cyan-400/60',
                        )}>
                          {FILE_TYPE_LABEL[doc.fileType] ?? doc.fileType.toUpperCase()}
                        </span>
                        <span className="text-white/15">·</span>
                        <span className="text-[9px] font-mono text-white/25">
                          {doc.chunksCount} chunk{doc.chunksCount !== 1 ? 's' : ''}
                        </span>
                        <span className="text-white/15">·</span>
                        <span className="text-[9px] font-mono text-white/20">
                          {formatDate(doc.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Management buttons */}
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {/* Select for Compare */}
                      {onMultiAction && (
                        <button
                          onClick={() => toggleSelect(doc.id)}
                          title={selectedIds.includes(doc.id) ? 'Deselect' : 'Select for Compare'}
                          className={cn(
                            'p-1 rounded-lg transition-all',
                            selectedIds.includes(doc.id)
                              ? 'text-cyan-300 bg-cyan-500/15 border border-cyan-400/20'
                              : 'text-white/20 hover:text-cyan-400/60 hover:bg-cyan-500/10',
                          )}
                        >
                          {selectedIds.includes(doc.id)
                            ? <CheckSquare className="w-3 h-3" />
                            : <Square className="w-3 h-3" />}
                        </button>
                      )}

                      {/* View chunks */}
                      <button
                        onClick={() => void handleViewChunks(doc.id, doc.title)}
                        title="Preview first 10 chunks"
                        className="p-1 rounded-lg text-white/20 hover:text-cyan-400/70 hover:bg-cyan-500/10 transition-all"
                      >
                        <Eye className="w-3 h-3" />
                      </button>

                      {/* Re-index placeholder */}
                      <button
                        disabled
                        title="Re-index: re-upload the file to re-index this document"
                        className="p-1 rounded-lg text-white/10 cursor-not-allowed"
                      >
                        <RotateCw className="w-3 h-3" />
                      </button>

                      {/* Delete — with inline confirmation */}
                      {deletingId === doc.id ? (
                        <span className="p-1">
                          <Loader2 className="w-3 h-3 text-red-400/50 animate-spin" />
                        </span>
                      ) : confirmDeleteId === doc.id ? (
                        <div className="flex items-center gap-1 ml-0.5">
                          <button
                            onClick={() => void handleDelete(doc.id)}
                            className="px-1.5 py-0.5 rounded text-[8px] font-mono text-red-300
                              bg-red-500/15 border border-red-400/20 hover:bg-red-500/25 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-0.5 rounded text-[8px] font-mono
                              text-white/30 hover:text-white/60 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(doc.id)}
                          title="Delete document and all its chunks"
                          className="p-1 rounded-lg text-white/20 hover:text-red-400/70 hover:bg-red-500/10 transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* One-click actions */}
                  {onAction && (
                    <div className="space-y-2">
                      {doc.chunksCount === 0 ? (
                        /* No chunks — show a clear disabled state */
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl
                          bg-amber-500/6 border border-amber-400/15">
                          <AlertCircle className="w-3 h-3 text-amber-400/50 flex-shrink-0" />
                          <p className="text-[9px] font-mono text-amber-300/50">
                            No chunks indexed — re-upload this file to enable actions.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* ── Auto Research Report — primary action ── */}
                          <div className="space-y-1">
                            <button
                              onClick={() => {
                                setConfirmDeleteId(null);
                                setReportSentId(doc.id);
                                onAction(
                                  autoResearchPrompt(doc.title, doc.fileName ?? doc.title),
                                  doc.id,
                                );
                              }}
                              className="w-full flex items-center gap-2 py-1.5 px-3 rounded-xl
                                bg-gradient-to-r from-violet-500/12 via-cyan-500/8 to-violet-500/12
                                border border-violet-400/25 hover:border-violet-400/40
                                text-[10px] font-mono text-violet-200 hover:text-white
                                transition-all duration-200 group"
                            >
                              <BrainCircuit className="w-3 h-3 text-violet-400 flex-shrink-0" />
                              <span className="font-semibold">Auto Research Report</span>
                              <span className="ml-auto text-[7px] font-bold uppercase px-1.5 py-0.5 rounded
                                bg-violet-500/20 border border-violet-400/20 text-violet-300 flex-shrink-0">
                                Research OS
                              </span>
                            </button>

                            {/* Sent confirmation */}
                            <AnimatePresence>
                              {reportSentId === doc.id && (
                                <motion.div
                                  key="report-sent"
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.15 }}
                                  className="overflow-hidden"
                                >
                                  <div className="flex items-center gap-1.5 px-1 py-0.5">
                                    <CheckCircle className="w-2.5 h-2.5 text-violet-400/70 flex-shrink-0" />
                                    <p className="text-[9px] font-mono text-violet-300/60">
                                      Research report prompt sent to Agent Chat.
                                    </p>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* ── Quick actions ── */}
                          <div className="flex flex-wrap gap-1">
                            {QUICK_ACTIONS.map(({ label, prompt }) => (
                              <button
                                key={label}
                                onClick={() => {
                                  setConfirmDeleteId(null);
                                  setReportSentId(null);
                                  onAction(prompt(doc.title), doc.id);
                                }}
                                className="px-2 py-0.5 rounded-lg bg-white/4 border border-white/8
                                  text-[9px] font-mono text-white/40
                                  hover:bg-cyan-500/15 hover:border-cyan-400/25 hover:text-cyan-300
                                  transition-all duration-150"
                              >
                                {label}
                              </button>
                            ))}
                            {/* Toggle deep actions */}
                            <button
                              onClick={() =>
                                setExpandedCardId((prev) => (prev === doc.id ? null : doc.id))
                              }
                              className="px-2 py-0.5 rounded-lg bg-white/4 border border-white/8
                                text-[9px] font-mono text-white/30
                                hover:bg-violet-500/15 hover:border-violet-400/25 hover:text-violet-300
                                transition-all duration-150 flex items-center gap-0.5"
                            >
                              {expandedCardId === doc.id ? 'Less' : 'More'}
                              <ChevronDown
                                className={cn(
                                  'w-2.5 h-2.5 transition-transform duration-200',
                                  expandedCardId === doc.id && 'rotate-180',
                                )}
                              />
                            </button>
                          </div>

                          {/* Deep-dive actions — shown when expanded */}
                          <AnimatePresence initial={false}>
                            {expandedCardId === doc.id && (
                              <motion.div
                                key="deep"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.18 }}
                                className="overflow-hidden"
                              >
                                <div className="flex flex-wrap gap-1 pt-0.5 border-t border-white/5">
                                  {DEEP_ACTIONS.map(({ label, prompt }) => (
                                    <button
                                      key={label}
                                      onClick={() => {
                                        setConfirmDeleteId(null);
                                        setReportSentId(null);
                                        onAction(prompt(doc.title), doc.id);
                                      }}
                                      className="px-2 py-0.5 rounded-lg bg-white/4 border border-white/8
                                        text-[9px] font-mono text-white/40
                                        hover:bg-violet-500/15 hover:border-violet-400/25 hover:text-violet-300
                                        transition-all duration-150"
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-white/5" />

        {/* ── Upload Form ── */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-3">
            Add Document
          </p>
          <p className="text-[11px] text-white/30 leading-relaxed mb-3">
            Upload .txt, .md, .pdf, .docx, .png, .jpg, .jpeg, .webp, .srt, or .vtt to index into Supabase pgvector.
            Files are chunked and embedded locally. Video transcript support coming soon.
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1.5">
                File
              </label>
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.pdf,.docx,.png,.jpg,.jpeg,.webp,.srt,.vtt"
                required
                className="block w-full text-[11px] text-white/50
                  file:mr-2.5 file:py-1 file:px-2.5
                  file:rounded-lg file:border-0
                  file:text-[10px] file:font-medium
                  file:bg-cyan-500/15 file:text-cyan-300
                  hover:file:bg-cyan-500/25 cursor-pointer"
              />
              <p className="text-white/20 text-[9px] mt-1 font-mono">
                .txt · .md · .pdf · .docx · .png · .jpg · .jpeg · .webp · .srt · .vtt &nbsp;|&nbsp; max 10 MB
              </p>
            </div>

            <div>
              <label className="block text-[10px] text-white/40 uppercase tracking-wider mb-1.5">
                Title{' '}
                <span className="text-white/20 normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Defaults to file name"
                maxLength={500}
                className="w-full bg-white/4 border border-white/8 rounded-xl px-3 py-2
                  text-[11px] text-white/70 placeholder-white/15
                  focus:outline-none focus:border-cyan-400/30 focus:bg-white/6 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={uploadState.status === 'uploading'}
              className="w-full flex items-center justify-center gap-2 py-2 px-4
                bg-cyan-500/12 hover:bg-cyan-500/20 border border-cyan-400/20
                text-cyan-300 text-[11px] font-mono rounded-xl
                transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {uploadState.status === 'uploading' ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Indexing document…</>
              ) : (
                <><Upload className="w-3.5 h-3.5" /> Upload &amp; Index</>
              )}
            </button>
          </form>

          <AnimatePresence mode="wait">
            {uploadState.status === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="flex items-start gap-2.5 bg-emerald-500/8 border border-emerald-500/15 rounded-xl p-3 mt-3"
              >
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-emerald-300 text-[11px] font-semibold">Indexed successfully</p>
                  <p className="text-white/40 text-[10px] mt-0.5">
                    <span className="text-white/60">{uploadState.fileName}</span>
                    {' · '}
                    <span className={cn(
                      'font-mono',
                      uploadState.fileType === 'image' ? 'text-violet-400/60' : 'text-cyan-400/60',
                    )}>
                      {FILE_TYPE_LABEL[uploadState.fileType] ?? uploadState.fileType.toUpperCase()}
                    </span>
                    {' · '}
                    {uploadState.chunksInserted} chunk{uploadState.chunksInserted !== 1 ? 's' : ''} inserted
                  </p>
                  <p className="text-white/25 text-[10px] mt-1.5 italic">
                    Now ask Aivora about this document.
                  </p>
                </div>
              </motion.div>
            )}
            {uploadState.status === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="flex items-start gap-2.5 bg-red-500/8 border border-red-500/15 rounded-xl p-3 mt-3"
              >
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-red-300 text-[11px]">{uploadState.message}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Chunks Preview Modal ── */}
      <AnimatePresence>
        {chunksModal.open && (
          <motion.div
            key="chunks-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setChunksModal({ open: false })}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg max-h-[75vh] flex flex-col
                bg-slate-950 border border-white/10 rounded-2xl overflow-hidden
                shadow-[0_0_60px_rgba(0,0,0,0.6)]"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Eye className="w-3.5 h-3.5 text-cyan-400/60 flex-shrink-0" />
                  <span className="text-[11px] font-semibold text-white/70 flex-shrink-0">
                    Chunk preview
                  </span>
                  <span className="text-[10px] text-white/30 font-mono truncate">
                    — {chunksModal.docTitle}
                  </span>
                </div>
                <button
                  onClick={() => setChunksModal({ open: false })}
                  className="text-white/25 hover:text-white/60 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 custom-scrollbar">
                {chunksModal.loading && (
                  <div className="flex items-center justify-center gap-2 py-8">
                    <Loader2 className="w-4 h-4 text-cyan-400/40 animate-spin" />
                    <span className="text-[10px] text-white/25 font-mono">Loading chunks…</span>
                  </div>
                )}
                {!chunksModal.loading && chunksModal.error && (
                  <div className="flex items-center gap-2 bg-red-500/8 border border-red-500/15 rounded-xl p-3">
                    <AlertCircle className="w-3.5 h-3.5 text-red-400/60 shrink-0" />
                    <p className="text-red-300/70 text-[10px]">{chunksModal.error}</p>
                  </div>
                )}
                {!chunksModal.loading && !chunksModal.error && chunksModal.chunks.length === 0 && (
                  <p className="text-center text-[10px] text-white/25 py-8">
                    No chunks found for this document.
                  </p>
                )}
                {!chunksModal.loading && chunksModal.chunks.map((chunk) => (
                  <div
                    key={chunk.index}
                    className="bg-white/[0.03] border border-white/8 rounded-xl p-3 space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-cyan-400/60">
                        chunk #{chunk.index}
                      </span>
                      {chunk.tokenCount != null && (
                        <span className="text-[9px] font-mono text-white/25">
                          {chunk.tokenCount} tokens
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-white/55 leading-relaxed whitespace-pre-wrap font-mono">
                      {chunk.content}
                    </p>
                  </div>
                ))}
              </div>

              {/* Modal footer */}
              {!chunksModal.loading && (
                <div className="px-5 py-2.5 border-t border-white/5 flex-shrink-0">
                  <p className="text-[9px] text-white/20 font-mono">
                    {chunksModal.chunks.length > 0
                      ? `First ${chunksModal.chunks.length} chunk${chunksModal.chunks.length !== 1 ? 's' : ''} shown`
                      : 'No chunks'}
                    {' · '}click outside or <X className="w-2.5 h-2.5 inline" /> to close
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
