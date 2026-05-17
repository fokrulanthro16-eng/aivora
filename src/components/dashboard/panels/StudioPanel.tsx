'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Wand2, BookOpen, ListChecks, Presentation, FileText, Share2,
  GitBranch, BarChart2, Subtitles, Film, Video, Layers, Network,
  Loader2, RefreshCw, ChevronRight, Square, CheckSquare,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';

// ── Types ──────────────────────────────────────────────────────────────────────

type DocRow = { id: string; title: string; fileType: string };

type DocsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; docs: DocRow[] }
  | { status: 'error'; message: string };

type WorkflowCard = {
  id: string;
  category: string;
  title: string;
  description: string;
  badge: string;
  icon: typeof Wand2;
  prompt: (docs: DocRow[]) => string;
  disabled?: boolean;
  disabledReason?: string;
};

// ── Prompt builders (must match detectStudioWorkflow in aivora-agent.ts) ──────

function studyPackPrompt(): string {
  return 'Generate a complete study pack for this content including: key concepts, definitions, summary, important facts, and review questions.';
}
function actionItemsPrompt(): string {
  return 'Extract all action items, tasks, decisions, and next steps from this content. Format as a prioritized checklist.';
}
function presentationPrompt(): string {
  return 'Create a 10-slide presentation outline with title, speaker notes, and key bullet points for each slide based on this content.';
}
function blogPostPrompt(): string {
  return 'Create a blog post from this content with an engaging title, introduction, body sections with subheadings, and a conclusion.';
}
function linkedInPrompt(): string {
  return 'Create a LinkedIn post from this content — professional tone, key insight hook, 3-5 bullet points, and a call to action. Under 300 words.';
}
function githubReadmePrompt(): string {
  return 'Generate a GitHub README from this content with Overview, Features, Installation, Usage, and Contributing sections in standard markdown.';
}
function graphicalReportPrompt(): string {
  return 'Create a graphical report with key statistics, data highlights, trends, and visual-ready tables from this content.';
}
function transcriptSummaryPrompt(): string {
  return 'Summarize this transcript into: key topics discussed, important quotes, decisions made, and main takeaways.';
}
function sceneBreakdownPrompt(): string {
  return 'Create a scene breakdown from this content with scene number, location, characters, action description, and duration estimate for each scene.';
}
function videoScriptPrompt(): string {
  return 'Write a video script with hook, main content sections with timestamps, transitions, and a call-to-action outro based on this content.';
}
function storyboardPrompt(): string {
  return 'Create a storyboard with scene number, visual description, narration text, camera direction, and mood notes for each panel.';
}
function videoIntelPrompt(): string {
  return 'Generate a video intelligence report covering: content analysis, key themes, notable moments, speaker insights, and production notes.';
}
function knowledgeGraphPrompt(): string {
  return 'Build a knowledge graph from this content: list all entities (people, places, concepts, organisations) and their relationships as structured data.';
}

// ── Workflow card definitions ─────────────────────────────────────────────────

const WORKFLOWS: WorkflowCard[] = [
  // Research & Writing
  {
    id: 'study-pack',
    category: 'Research',
    title: 'Study Pack',
    description: 'Key concepts, definitions, review questions',
    badge: 'RESEARCH',
    icon: BookOpen,
    prompt: studyPackPrompt,
  },
  {
    id: 'action-items',
    category: 'Research',
    title: 'Action Items',
    description: 'Tasks, decisions, and next steps checklist',
    badge: 'RESEARCH',
    icon: ListChecks,
    prompt: actionItemsPrompt,
  },
  {
    id: 'graphical-report',
    category: 'Research',
    title: 'Graphical Report',
    description: 'Key stats, trends, and visual-ready tables',
    badge: 'RESEARCH',
    icon: BarChart2,
    prompt: graphicalReportPrompt,
  },
  {
    id: 'knowledge-graph',
    category: 'Research',
    title: 'Knowledge Graph',
    description: 'Entities and relationships as structured data',
    badge: 'GRAPH',
    icon: Network,
    prompt: knowledgeGraphPrompt,
  },
  // Presentation & Publishing
  {
    id: 'presentation',
    category: 'Presentation',
    title: 'Presentation Outline',
    description: '10-slide outline with speaker notes',
    badge: 'SLIDES',
    icon: Presentation,
    prompt: presentationPrompt,
  },
  {
    id: 'blog-post',
    category: 'Presentation',
    title: 'Blog Post',
    description: 'Engaging post with intro, sections, conclusion',
    badge: 'WRITING',
    icon: FileText,
    prompt: blogPostPrompt,
  },
  {
    id: 'linkedin',
    category: 'Presentation',
    title: 'LinkedIn Post',
    description: 'Professional post under 300 words',
    badge: 'SOCIAL',
    icon: Share2,
    prompt: linkedInPrompt,
  },
  {
    id: 'github-readme',
    category: 'Presentation',
    title: 'GitHub README',
    description: 'Standard README with all sections',
    badge: 'DEV',
    icon: GitBranch,
    prompt: githubReadmePrompt,
  },
  // Media Intelligence
  {
    id: 'transcript-summary',
    category: 'Media',
    title: 'Transcript Summary',
    description: 'Key topics, quotes, decisions from transcript',
    badge: 'MEDIA',
    icon: Subtitles,
    prompt: transcriptSummaryPrompt,
  },
  {
    id: 'scene-breakdown',
    category: 'Media',
    title: 'Scene Breakdown',
    description: 'Scene-by-scene breakdown with locations & timing',
    badge: 'MEDIA',
    icon: Film,
    prompt: sceneBreakdownPrompt,
  },
  {
    id: 'video-script',
    category: 'Media',
    title: 'Video Script',
    description: 'Hook, timed sections, transitions, CTA outro',
    badge: 'MEDIA',
    icon: Video,
    prompt: videoScriptPrompt,
  },
  {
    id: 'storyboard',
    category: 'Media',
    title: 'Storyboard',
    description: 'Visual panels with narration and camera notes',
    badge: 'MEDIA',
    icon: Layers,
    prompt: storyboardPrompt,
  },
  {
    id: 'video-intel',
    category: 'Media',
    title: 'Video Intelligence',
    description: 'Themes, moments, speaker insights, production notes',
    badge: 'MEDIA',
    icon: Film,
    prompt: videoIntelPrompt,
  },
];

const CATEGORY_ORDER = ['Research', 'Presentation', 'Media'];

const BADGE_COLORS: Record<string, string> = {
  RESEARCH: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20',
  GRAPH:    'bg-violet-500/15 text-violet-300 border-violet-500/20',
  SLIDES:   'bg-blue-500/15 text-blue-300 border-blue-500/20',
  WRITING:  'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
  SOCIAL:   'bg-sky-500/15 text-sky-300 border-sky-500/20',
  DEV:      'bg-orange-500/15 text-orange-300 border-orange-500/20',
  MEDIA:    'bg-pink-500/15 text-pink-300 border-pink-500/20',
};

// ── Component ─────────────────────────────────────────────────────────────────

type StudioPanelProps = {
  className?: string;
  onMultiAction: (query: string, documentIds: string[]) => void;
};

export function StudioPanel({ className, onMultiAction }: StudioPanelProps) {
  const [docsState, setDocsState] = useState<DocsState>({ status: 'idle' });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setDocsState({ status: 'loading' });
    try {
      const res = await fetch('/api/documents');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { documents?: Array<{ id: string; title: string; source_type: string | null }> };
      const docs: DocRow[] = (data.documents ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        fileType: d.source_type ?? 'txt',
      }));
      setDocsState({ status: 'ready', docs });
    } catch (e) {
      setDocsState({ status: 'error', message: e instanceof Error ? e.message : 'Failed to load documents.' });
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchDocs(); }, [fetchDocs]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleRun(workflow: WorkflowCard) {
    const docs = docsState.status === 'ready' ? docsState.docs : [];
    const targets = selectedIds.length > 0
      ? docs.filter((d) => selectedIds.includes(d.id))
      : docs;

    if (targets.length === 0) return;

    const query = workflow.prompt(targets);
    setRunningId(workflow.id);
    onMultiAction(query, targets.map((d) => d.id));
    setTimeout(() => setRunningId(null), 2000);
  }

  const docs = docsState.status === 'ready' ? docsState.docs : [];
  const hasAny = docs.length > 0;

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    workflows: WORKFLOWS.filter((w) => w.category === cat),
  }));

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wand2 className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-xs font-mono font-semibold text-white/70 uppercase tracking-wider">
              Tools Studio
            </span>
          </div>
          <button
            onClick={() => void fetchDocs()}
            className="p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/6 transition-all"
            title="Refresh documents"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-white/30 font-mono">
          Select docs below, then run a workflow to generate content
        </p>
      </div>

      {/* Doc selector */}
      <div className="flex-shrink-0 border-b border-white/6 max-h-36 overflow-y-auto custom-scrollbar">
        {docsState.status === 'loading' && (
          <div className="flex items-center gap-2 px-4 py-3 text-white/30 text-[10px] font-mono">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading documents…
          </div>
        )}
        {docsState.status === 'error' && (
          <div className="px-4 py-2 text-[10px] text-red-400 font-mono">{docsState.message}</div>
        )}
        {docsState.status === 'ready' && docs.length === 0 && (
          <div className="px-4 py-3 text-[10px] text-white/25 font-mono">
            No documents yet — upload via the Vault tab.
          </div>
        )}
        {docsState.status === 'ready' && docs.map((doc) => {
          const selected = selectedIds.includes(doc.id);
          return (
            <button
              key={doc.id}
              onClick={() => toggleSelect(doc.id)}
              className={cn(
                'w-full flex items-center gap-2 px-4 py-2 text-left transition-all',
                selected ? 'bg-violet-500/10' : 'hover:bg-white/4',
              )}
            >
              {selected
                ? <CheckSquare className="w-3 h-3 text-violet-400 flex-shrink-0" />
                : <Square className="w-3 h-3 text-white/20 flex-shrink-0" />
              }
              <span className={cn('text-[10px] font-mono truncate', selected ? 'text-violet-300' : 'text-white/45')}>
                {doc.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selection hint */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex-shrink-0 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-1.5 bg-violet-500/8 border-b border-violet-500/15">
              <span className="text-[10px] text-violet-300 font-mono">
                {selectedIds.length} doc{selectedIds.length !== 1 ? 's' : ''} selected — workflows will use only these
              </span>
              <button
                onClick={() => setSelectedIds([])}
                className="text-[10px] text-white/30 hover:text-white/60 font-mono transition-colors"
              >
                clear
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Workflow cards */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-4">
        {!hasAny && docsState.status === 'ready' && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-white/20">
            <Wand2 className="w-6 h-6" />
            <p className="text-[10px] font-mono text-center">
              Upload documents in the Vault tab<br />to unlock studio workflows
            </p>
          </div>
        )}

        {grouped.map(({ category, workflows }) => (
          <div key={category}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-mono uppercase tracking-widest text-white/25">{category}</span>
              <div className="flex-1 h-px bg-white/6" />
            </div>
            <div className="space-y-1.5">
              {workflows.map((wf) => {
                const Icon = wf.icon;
                const isRunning = runningId === wf.id;
                const disabled = wf.disabled || !hasAny;

                return (
                  <motion.div
                    key={wf.id}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all',
                      disabled
                        ? 'border-white/5 bg-white/2 opacity-50'
                        : 'border-white/8 bg-white/3 hover:bg-white/5 hover:border-white/12',
                    )}
                    whileHover={disabled ? {} : { scale: 1.005 }}
                  >
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-white/6 border border-white/8 flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 text-white/50" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[11px] font-semibold text-white/75 font-mono truncate">{wf.title}</span>
                        <span className={cn(
                          'flex-shrink-0 text-[8px] px-1.5 py-0.5 rounded border font-mono uppercase tracking-wide',
                          BADGE_COLORS[wf.badge] ?? 'bg-white/8 text-white/30 border-white/10',
                        )}>
                          {wf.badge}
                        </span>
                      </div>
                      <p className="text-[9px] text-white/30 font-mono truncate">{wf.description}</p>
                      {wf.disabled && wf.disabledReason && (
                        <p className="text-[9px] text-amber-400/60 font-mono mt-0.5">{wf.disabledReason}</p>
                      )}
                    </div>

                    <button
                      disabled={disabled || isRunning}
                      onClick={() => handleRun(wf)}
                      className={cn(
                        'flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-mono font-semibold uppercase tracking-wide transition-all',
                        disabled
                          ? 'bg-white/4 text-white/20 cursor-not-allowed'
                          : 'bg-violet-500/20 text-violet-300 border border-violet-500/25 hover:bg-violet-500/30 hover:text-violet-200',
                      )}
                    >
                      {isRunning ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <>
                          Run
                          <ChevronRight className="w-3 h-3" />
                        </>
                      )}
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
