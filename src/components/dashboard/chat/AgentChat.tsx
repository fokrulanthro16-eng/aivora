'use client';

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  User,
  Cpu,
  AlertTriangle,
  MessageSquare,
  FlaskConical,
  BrainCircuit,
  Database,
  Download,
  Trash2,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { GlassPanel } from '@/components/dashboard/panels/GlassPanel';
import { cn } from '@/lib/utils/cn';
import type { ChatMessage, AgentPhase, ReasoningTrace, SystemMode, AgentAnalytics } from '@/lib/types/agent';
import type { SourceCitation } from '@/lib/types/citation';
import type { AivoraAgentResponse } from '@/lib/types/agent';
import { isWebGPUSupported, generateWithWebLLM, getWebLLMEngine } from '@/lib/ai/local-llm/webllm-client';
import {
  saveConversationMessage,
  clearLocalMemory,
  getMessageCount,
} from '@/lib/ai/memory/local-memory';

type AgentChatProps = {
  onPhaseChange: (phase: AgentPhase) => void;
  onCitationsChange: (citations: SourceCitation[]) => void;
  onTraceChange: (trace: ReasoningTrace | undefined) => void;
  onModeChange: (mode: SystemMode) => void;
  onAnalyticsChange: (analytics: AgentAnalytics) => void;
  onLocalAIReady?: () => void;
  className?: string;
};

const MODE_META: Record<SystemMode, { label: string; color: string; icon: typeof Cpu }> = {
  rag:           { label: 'RAG Mode',        color: '#22d3ee', icon: Database },
  'local-webllm':{ label: 'Local WebLLM',    color: '#8b5cf6', icon: BrainCircuit },
  demo:          { label: 'Aivora OS Lite',   color: '#f59e0b', icon: FlaskConical },
  'error-safe':  { label: 'Error-Safe Mode',  color: '#ef4444', icon: AlertTriangle },
};

// Markdown render config — defined at module scope so the object reference is
// stable across renders (avoids react-markdown re-mounting on every keystroke).
const MD_COMPONENTS: React.ComponentProps<typeof Markdown>['components'] = {
  p:      ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul:     ({ children }) => <ul className="list-disc pl-4 space-y-1 my-2">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal pl-4 space-y-1 my-2">{children}</ol>,
  li:     ({ children }) => <li className="text-white/80 leading-snug">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-white/95">{children}</strong>,
  em:     ({ children }) => <em className="italic text-white/55">{children}</em>,
  code:   ({ children }) => (
    <code className="font-mono text-cyan-300/80 text-[10px] bg-white/8 px-1 py-px rounded">
      {children}
    </code>
  ),
  hr: () => <hr className="border-white/10 my-3" />,
};

const CONVERSATION_ID = crypto.randomUUID();

export function AgentChat({
  onPhaseChange,
  onCitationsChange,
  onTraceChange,
  onModeChange,
  onAnalyticsChange,
  onLocalAIReady,
  className,
}: AgentChatProps) {
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [localAIEnabled, setLocalAIEnabled] = useState(false);
  const [webllmLoading, setWebllmLoading] = useState(false);
  const [webllmProgress, setWebllmProgress] = useState<{ p: number; text: string } | null>(null);
  const [memoryCount, setMemoryCount] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Set mounted after first client render so browser-only APIs are never called during SSR.
  useEffect(() => { void Promise.resolve(true).then(setMounted); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const refreshMemoryCount = useCallback(async () => {
    const count = await getMessageCount().catch(() => 0);
    setMemoryCount(count);
  }, []);

  // Load initial count from IndexedDB on mount (async — setState is in .then(), not synchronously in effect body).
  useEffect(() => {
    void getMessageCount().then(setMemoryCount).catch(() => {});
  }, []);

  const handleEnableLocalAI = useCallback(async () => {
    if (!isWebGPUSupported()) {
      toast.error('WebGPU not supported. Open in Chrome 113+ or Edge on a GPU-enabled device.');
      return;
    }
    setWebllmLoading(true);
    setWebllmProgress({ p: 0, text: 'Initializing…' });
    try {
      await getWebLLMEngine((p, text) => setWebllmProgress({ p, text }));
      setLocalAIEnabled(true);
      onLocalAIReady?.();
      toast.success('Local AI ready — ask your next question.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Local AI failed to load: ${msg}`);
    } finally {
      setWebllmLoading(false);
      setWebllmProgress(null);
    }
  }, [onLocalAIReady]);

  const handleSubmit = async () => {
    const query = input.trim();
    if (!query || isLoading || webllmLoading) return;

    const t0 = Date.now();
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: query,
      timestamp: t0,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    onPhaseChange('plan');
    onCitationsChange([]);
    onTraceChange(undefined);

    await saveConversationMessage({
      conversationId: CONVERSATION_ID,
      role: 'user',
      content: query,
      timestamp: t0,
    }).catch(() => {});

    try {
      // Phase animation while waiting for API
      const phases: AgentPhase[] = ['plan', 'retrieve', 'reflect', 'self_correct', 'respond'];
      let phaseIdx = 0;
      const phaseTimer = setInterval(() => {
        phaseIdx++;
        if (phaseIdx < phases.length) onPhaseChange(phases[phaseIdx]!);
        else clearInterval(phaseTimer);
      }, 800);

      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      clearInterval(phaseTimer);

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}`;
        try {
          const errData = await response.json() as { error?: string };
          if (errData.error) errMessage = errData.error;
        } catch {
          const text = await response.text().catch(() => '');
          if (text) errMessage = text.slice(0, 300);
        }
        throw new Error(errMessage);
      }

      const data = await response.json() as AivoraAgentResponse;

      let finalAnswer = data.answer;

      // Determine mode from backend signal.
      let systemMode: SystemMode = data.needsLocalLLM
        ? (isWebGPUSupported() ? 'local-webllm' : 'demo')
        : data.demoMode
        ? 'demo'
        : 'rag';

      // ── Hybrid AI flow ────────────────────────────────────────────────────
      if (data.needsLocalLLM) {
        if (!isWebGPUSupported()) {
          if (data.answer) {
            // Deterministic answer available — show it even without WebGPU.
            finalAnswer = data.answer;
            systemMode = 'rag';
          } else {
            finalAnswer =
              'Retrieval completed but your browser does not support WebGPU. ' +
              'Open in Chrome 113+ or Edge on a GPU-enabled device for local AI generation.';
            systemMode = 'demo';
          }
        } else if (!localAIEnabled) {
          if (data.answer) {
            // Deterministic answer built from retrieved chunks — show it immediately.
            // WebLLM remains available in the header for a richer generative response.
            finalAnswer = data.answer;
            systemMode = 'rag';
          } else {
            // No deterministic answer — prompt user to enable WebLLM.
            const count = data.citations.length;
            finalAnswer = count > 0
              ? `**${count} source chunk${count !== 1 ? 's' : ''} retrieved from your knowledge documents.**\n\n` +
                `Click **Enable Local AI** in the header to generate a grounded answer from this context.`
              : `**Aivora's vector system is connected, but no knowledge documents have been uploaded yet.**\n\n` +
                `Upload .txt or .md files via the Admin panel to activate source-grounded retrieval. ` +
                `Or click **Enable Local AI** to answer general questions using browser-local Phi-3.5-mini.`;
          }
        } else {
          // Model is loaded — generate with WebLLM using retrieved context.
          setWebllmLoading(true);
          onPhaseChange('respond');
          const context = data.retrievedContext
            ?? (data.citations?.length
              ? data.citations.map((c) => `[${c.documentTitle}] ${c.quotedText}`).join('\n\n')
              : undefined);
          try {
            finalAnswer = await generateWithWebLLM(query, {
              context,
              maxTokens: 512,
              onProgress: (p, text) => setWebllmProgress({ p, text }),
            });
            systemMode = 'local-webllm';
            toast.success('Generated locally in your browser.');
          } catch (webllmErr) {
            const msg = webllmErr instanceof Error ? webllmErr.message : String(webllmErr);
            toast.warning(`Local AI error: ${msg}`);
            systemMode = 'demo';
            finalAnswer = 'Local AI encountered an error. Try again.';
          } finally {
            setWebllmLoading(false);
            setWebllmProgress(null);
          }
        }
      } else if (data.demoMode && isWebGPUSupported() && localAIEnabled) {
        // No Supabase but model is loaded — answer from general knowledge.
        setWebllmLoading(true);
        onPhaseChange('respond');
        try {
          finalAnswer = await generateWithWebLLM(query, {
            maxTokens: 512,
            onProgress: (p, text) => setWebllmProgress({ p, text }),
          });
          systemMode = 'local-webllm';
          toast.success('Generated locally in your browser.');
        } catch (webllmErr) {
          const msg = webllmErr instanceof Error ? webllmErr.message : String(webllmErr);
          toast.warning(`Local AI error: ${msg}`);
          systemMode = 'demo';
        } finally {
          setWebllmLoading(false);
          setWebllmProgress(null);
        }
      }
      // else: rag mode — finalAnswer is already data.answer from server LLM.

      const latencyMs = Date.now() - t0;

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: finalAnswer,
        citations: data.citations,
        reasoningTrace: data.reasoningTrace,
        confidence: data.confidence,
        needsMoreContext: data.needsMoreContext,
        demoMode: data.demoMode,
        needsLocalLLM: data.needsLocalLLM,
        systemMode,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      onCitationsChange(data.citations);
      onTraceChange(data.reasoningTrace);
      onPhaseChange('idle');
      onModeChange(systemMode);

      const newMemCount = memoryCount + 2;

      onAnalyticsChange({
        confidence: data.confidence,
        citationCount: data.citations.length,
        latencyMs,
        mode: systemMode,
        messagesInSession: messages.length + 2,
        memoryCount: newMemCount,
      });

      await saveConversationMessage({
        conversationId: CONVERSATION_ID,
        role: 'assistant',
        content: finalAnswer,
        timestamp: Date.now(),
        systemMode,
        confidence: data.confidence,
        citations: data.citations,
        reasoningTrace: data.reasoningTrace,
      }).catch(() => {});

      await refreshMemoryCount();
    } catch (err) {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
        systemMode: 'error-safe',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      onPhaseChange('error');
      onModeChange('error-safe');
      toast.error('Agent error. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearMemory = async () => {
    await clearLocalMemory();
    await refreshMemoryCount();
    toast.success('Local memory cleared.');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <GlassPanel className={cn('flex flex-col h-full overflow-hidden', className)} glow="cyan">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-shrink-0">
        <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400/70">
          Agent Chat
        </span>
        <div className="flex items-center gap-2">
          {/* Enable Local AI button or ready badge — rendered only after mount to avoid hydration mismatch */}
          {mounted && isWebGPUSupported() ? (
            localAIEnabled ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-400/20">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                <span className="text-[9px] font-mono text-violet-300">Local AI Ready</span>
              </div>
            ) : (
              <button
                onClick={handleEnableLocalAI}
                disabled={webllmLoading}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/12 border border-violet-400/25 text-violet-300 hover:bg-violet-500/22 transition-colors text-[9px] font-mono disabled:opacity-40"
              >
                <Zap className="w-3 h-3 flex-shrink-0" />
                {webllmLoading ? 'Loading…' : 'Enable Local AI'}
              </button>
            )
          ) : null}
          {/* Memory badge */}
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-400/20">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            <span className="text-[9px] font-mono text-violet-300">{memoryCount} in memory</span>
          </div>
          <button
            onClick={handleClearMemory}
            title="Clear local memory"
            className="text-white/20 hover:text-red-400/70 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* WebLLM loading progress */}
      <AnimatePresence>
        {webllmLoading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mb-2 overflow-hidden"
          >
            <div className="flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/8 px-3 py-2.5">
              <Download className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 animate-bounce" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-violet-300 font-semibold mb-1">Loading local AI model…</div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 rounded-full"
                    style={{ width: `${(webllmProgress?.p ?? 0) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                {webllmProgress && (
                  <div className="text-[9px] text-white/25 font-mono mt-0.5 truncate">
                    {webllmProgress.text}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4 custom-scrollbar">
        <AnimatePresence initial={false}>
          {messages.length === 0 ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-full min-h-[200px] gap-4 text-center"
            >
              <motion.div
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <MessageSquare className="w-10 h-10 text-cyan-400/20" />
              </motion.div>
              <div>
                <p className="text-white/40 text-sm font-medium mb-1">Ask Aivora anything</p>
                <p className="text-white/20 text-xs max-w-xs leading-relaxed">
                  Every answer is grounded in your uploaded knowledge documents. Open the{' '}
                  <span className="text-cyan-400/50 font-mono">Vault</span> tab to upload files and enable grounded retrieval.
                </p>
              </div>
              {mounted && isWebGPUSupported() && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-400/15">
                  <BrainCircuit className="w-3 h-3 text-violet-400" />
                  <span className="text-[10px] text-violet-300">WebGPU detected — Local WebLLM available</span>
                </div>
              )}
            </motion.div>
          ) : (
            messages.map((msg) => {
              const modeMeta = msg.systemMode ? MODE_META[msg.systemMode] : undefined;
              const ModeIcon = modeMeta?.icon;
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400/30 to-violet-500/30 border border-cyan-400/20 flex items-center justify-center">
                      <Cpu className="w-3.5 h-3.5 text-cyan-300" />
                    </div>
                  )}

                  <div className={cn('max-w-[80%]', msg.role === 'user' ? 'order-first' : '')}>
                    <div
                      className={cn(
                        'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                        msg.role === 'user'
                          ? 'bg-cyan-500/12 border border-cyan-400/20 text-white/90 rounded-tr-sm'
                          : 'bg-white/4 border border-white/8 text-white/80 rounded-tl-sm'
                      )}
                    >
                      {msg.role === 'assistant' ? (
                        <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                          {msg.content}
                        </Markdown>
                      ) : (
                        msg.content
                      )}

                      {/* Mode badge */}
                      {msg.role === 'assistant' && modeMeta && ModeIcon && (
                        <div
                          className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-white/8 text-[10px]"
                          style={{ color: modeMeta.color }}
                        >
                          <ModeIcon className="w-3 h-3" />
                          <span className="font-semibold tracking-wide">{modeMeta.label}</span>
                          {msg.systemMode === 'rag' && (
                            <span className="text-white/25 ml-1">
                              — source-grounded answer
                              {msg.needsLocalLLM && ' · Local WebLLM optional'}
                            </span>
                          )}
                          {msg.systemMode === 'local-webllm' && (
                            <span className="text-white/25 ml-1">— answer generated in your browser</span>
                          )}
                        </div>
                      )}

                      {msg.needsMoreContext && !msg.citations?.length && msg.systemMode !== 'local-webllm' && (
                        <div className="flex items-center gap-1.5 mt-2 text-amber-400/70 text-[11px]">
                          <AlertTriangle className="w-3 h-3" />
                          <span>No source documents found — upload files to enable grounded answers</span>
                        </div>
                      )}
                    </div>

                    {msg.confidence !== undefined && msg.role === 'assistant' && (
                      <div className="flex items-center gap-2 mt-1.5 px-1">
                        <div className="w-16 h-0.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                            style={{ width: `${msg.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-white/25 font-mono">
                          {(msg.confidence * 100).toFixed(0)}% confidence
                        </span>
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-white/50" />
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </AnimatePresence>

        {/* Loading dots */}
        {isLoading && !webllmLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3 items-start"
          >
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400/30 to-violet-500/30 border border-cyan-400/20 flex items-center justify-center">
              <Cpu className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
            </div>
            <div className="bg-white/4 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1.5">
                {[0, 0.15, 0.3].map((delay) => (
                  <motion.div
                    key={delay}
                    className="w-1.5 h-1.5 rounded-full bg-cyan-400/60"
                    animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
                    transition={{ duration: 1, repeat: Infinity, delay }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-white/6 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Aivora anything…"
            rows={1}
            disabled={isLoading || webllmLoading}
            className={cn(
              'flex-1 bg-white/4 border border-white/10 rounded-2xl px-4 py-3',
              'text-sm text-white/80 placeholder:text-white/20 resize-none',
              'focus:outline-none focus:border-cyan-400/35 focus:bg-white/6',
              'transition-all duration-200 leading-relaxed disabled:opacity-40'
            )}
            style={{ minHeight: 44, maxHeight: 120 }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading || webllmLoading}
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center',
              'bg-gradient-to-br from-cyan-500/80 to-violet-600/80 border border-cyan-400/25 text-white',
              'hover:from-cyan-400/90 hover:to-violet-500/90 transition-all duration-200',
              'disabled:opacity-25 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(34,211,238,0.15)]'
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[9px] text-white/15 text-center mt-1.5 font-mono">
          ↵ send · ⇧↵ newline · local memory: {memoryCount} msgs
        </p>
      </div>
    </GlassPanel>
  );
}
