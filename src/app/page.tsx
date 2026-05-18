import Link from 'next/link';
import {
  Cpu, Database, Shield, Zap, BrainCircuit,
  Wand2, FileText, ArrowRight, Activity,
  CheckCircle,
} from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Aivora — Autonomous AI OS',
  description:
    'Super-Intelligent Autonomous Multimodal AI OS. Supabase pgvector RAG, local embeddings, browser-local LLM, and holographic dashboard — no cloud AI API required.',
};

const FEATURES = [
  {
    icon: Database,
    title: 'Hybrid-Cloud RAG',
    description:
      'Supabase pgvector combines vector similarity and keyword search for high-precision knowledge retrieval. Every answer is source-grounded.',
    color: '#22d3ee',
  },
  {
    icon: Cpu,
    title: 'Local Embeddings',
    description:
      'MiniLM-L6-v2 via @xenova/transformers runs entirely in Node — no OpenAI embedding API required. Fast, private, free.',
    color: '#22d3ee',
  },
  {
    icon: BrainCircuit,
    title: 'Browser-Local LLM',
    description:
      'Phi-3.5-mini via WebGPU generates answers entirely in your browser. Zero cloud inference cost.',
    color: '#8b5cf6',
  },
  {
    icon: Wand2,
    title: 'Tools Studio',
    description:
      '13 AI workflows: Study Packs, Blog Posts, Video Scripts, Storyboards, Knowledge Graphs, Presentations, and more.',
    color: '#8b5cf6',
  },
  {
    icon: FileText,
    title: 'PPTX + PDF Export',
    description:
      'Download presentations as real .pptx files or export research reports as formatted PDFs. Save outputs to the Vault.',
    color: '#f59e0b',
  },
  {
    icon: Shield,
    title: 'Privacy-First',
    description:
      'Embeddings, LLM inference, and memory are all local. No telemetry. Your documents never leave your machine.',
    color: '#10b981',
  },
];

const WORKFLOW = [
  {
    step: '01',
    title: 'Upload Knowledge',
    desc: 'Drop PDFs, DOCX, images, or transcripts into the Knowledge Vault. Aivora chunks, embeds, and indexes them into Supabase pgvector instantly.',
  },
  {
    step: '02',
    title: 'Ask or Run a Workflow',
    desc: 'Chat with Aivora for source-grounded answers, or open Tools Studio and pick a workflow — Study Pack, Blog Post, Video Intelligence Report, and more.',
  },
  {
    step: '03',
    title: 'Export and Save',
    desc: 'Download research reports as PDF, export presentations as .pptx, or copy Markdown. Outputs are saved to the Vault for future retrieval.',
  },
];

const TECH_STACK = [
  { label: 'Next.js 16', note: 'App Router' },
  { label: 'TypeScript', note: 'strict' },
  { label: 'Tailwind CSS', note: 'v4' },
  { label: 'Supabase', note: 'pgvector' },
  { label: '@xenova/transformers', note: 'MiniLM' },
  { label: 'WebGPU / WebLLM', note: 'Phi-3.5-mini' },
  { label: 'Framer Motion', note: 'animations' },
  { label: 'Three.js', note: 'holographic core' },
  { label: 'React Flow', note: 'agent graph' },
  { label: 'pptxgenjs', note: 'PPTX export' },
  { label: 'Dexie', note: 'IndexedDB memory' },
  { label: 'Zod', note: 'validation' },
];

const ONBOARDING_CHECKS = [
  'Clone the repo and run npm install',
  'Create a Supabase project and enable pgvector',
  'Copy .env.example to .env.local and fill in your keys',
  'Run npm run dev and open localhost:3000',
];

export default function LandingPage() {
  return (
    <div className="min-h-screen text-white overflow-x-hidden" style={{ background: '#020617' }}>

      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.6]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(34,211,238,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 50% -20%, rgba(34,211,238,0.10) 0%, transparent 70%),
            radial-gradient(ellipse 50% 50% at 90% 110%, rgba(139,92,246,0.07) 0%, transparent 60%)
          `,
        }}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-4 border-b border-white/5 backdrop-blur-xl sticky top-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-400/25 to-violet-500/25 border border-cyan-400/20 flex items-center justify-center">
            <Cpu className="w-3.5 h-3.5 text-cyan-300" />
          </div>
          <span className="text-sm font-bold bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent tracking-tight">
            Aivora
          </span>
          <span className="text-[9px] text-white/20 font-mono">v0.2.0</span>
        </div>
        <nav className="flex items-center gap-1 md:gap-5">
          <a href="#features"  className="hidden md:block text-[12px] text-white/40 hover:text-white/70 transition-colors font-mono px-2 py-1">Features</a>
          <a href="#workflow"  className="hidden md:block text-[12px] text-white/40 hover:text-white/70 transition-colors font-mono px-2 py-1">How it works</a>
          <a href="#stack"     className="hidden md:block text-[12px] text-white/40 hover:text-white/70 transition-colors font-mono px-2 py-1">Stack</a>
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/15 border border-cyan-400/30
              text-cyan-300 hover:bg-cyan-500/25 hover:border-cyan-400/50 transition-all text-[12px] font-mono font-semibold"
          >
            Dashboard <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative z-10 text-center px-6 pt-24 pb-20">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-400/20 mb-8">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[11px] font-mono text-cyan-300">Open-source · Local-first · Privacy-first</span>
        </div>

        <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight mb-6 leading-[1.05]">
          <span className="bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">
            Autonomous
          </span>
          <br />
          <span className="text-white">AI Operating System</span>
        </h1>

        <p className="text-white/50 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
          Aivora combines{' '}
          <span className="text-cyan-300 font-medium">Supabase pgvector RAG</span>,
          local embeddings, browser-local LLM inference, and a holographic dashboard —
          all without requiring OpenAI, Anthropic, or any cloud AI API.
        </p>

        {/* CTA buttons */}
        <div className="flex items-center justify-center gap-4 flex-wrap mb-10">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 px-8 py-3.5 rounded-2xl
              bg-gradient-to-r from-cyan-500/25 to-violet-500/20
              border border-cyan-400/35 text-white font-semibold text-sm
              hover:from-cyan-500/35 hover:to-violet-500/30 hover:border-cyan-400/55
              transition-all duration-200 shadow-[0_0_40px_rgba(34,211,238,0.12)]"
          >
            <Zap className="w-4 h-4 text-cyan-300" />
            Launch Dashboard
          </Link>
          <a
            href="https://github.com/fokrulanthro16-eng/aivora"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl
              bg-white/5 border border-white/10 text-white/55 font-medium text-sm
              hover:bg-white/9 hover:text-white/80 transition-all duration-200"
          >
            View on GitHub
          </a>
        </div>

        {/* Tech tag row */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {['pgvector', 'MiniLM-L6-v2', 'WebGPU', 'Next.js 16', 'TypeScript', 'pptxgenjs'].map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-lg bg-white/4 border border-white/8 text-[10px] font-mono text-white/35"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section id="features" className="relative z-10 px-6 md:px-12 pb-24">
        <p className="text-[11px] font-mono uppercase tracking-widest text-cyan-400/60 text-center mb-2">
          Features
        </p>
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          Everything you need for an{' '}
          <span className="text-cyan-300">AI-native knowledge base</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {FEATURES.map(({ icon: Icon, title, description, color }) => (
            <div
              key={title}
              className="p-6 rounded-2xl bg-white/[0.025] border border-white/8 hover:border-white/16 transition-all duration-300"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${color}18`, border: `1px solid ${color}30` }}
              >
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <h3 className="text-[15px] font-semibold text-white/90 mb-2">{title}</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Demo Workflow ───────────────────────────────────────────────────── */}
      <section id="workflow" className="relative z-10 px-6 md:px-12 pb-24">
        <p className="text-[11px] font-mono uppercase tracking-widest text-violet-400/60 text-center mb-2">
          How it works
        </p>
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-14">
          From document to insight in{' '}
          <span className="text-violet-300">three steps</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-4xl mx-auto">
          {WORKFLOW.map(({ step, title, desc }, i) => (
            <div key={step} className="relative">
              {/* Connector line between steps on desktop */}
              {i < WORKFLOW.length - 1 && (
                <div className="hidden md:block absolute top-6 left-full w-full h-px bg-gradient-to-r from-white/10 to-transparent -translate-y-px pointer-events-none" style={{ width: 'calc(100% - 1rem)' }} />
              )}
              <div className="text-[56px] font-black text-white/[0.05] font-mono leading-none mb-3 select-none">
                {step}
              </div>
              <h3 className="text-[16px] font-semibold text-white mb-2">{title}</h3>
              <p className="text-[13px] text-white/40 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tech Stack ─────────────────────────────────────────────────────── */}
      <section id="stack" className="relative z-10 px-6 md:px-12 pb-24 text-center">
        <p className="text-[11px] font-mono uppercase tracking-widest text-white/25 mb-8">
          Tech Stack
        </p>
        <div className="flex flex-wrap gap-3 justify-center max-w-3xl mx-auto">
          {TECH_STACK.map(({ label, note }) => (
            <div
              key={label}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/4 border border-white/8 hover:border-white/16 transition-all"
            >
              <span className="text-[12px] font-mono text-white/60">{label}</span>
              <span className="text-[10px] font-mono text-white/25">{note}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Quick Setup ─────────────────────────────────────────────────────── */}
      <section className="relative z-10 px-6 md:px-12 pb-24">
        <div className="max-w-3xl mx-auto">
          <p className="text-[11px] font-mono uppercase tracking-widest text-white/25 text-center mb-8">
            Get started in minutes
          </p>
          <div className="p-8 rounded-3xl bg-gradient-to-br from-white/[0.025] to-white/[0.015] border border-white/8">
            <div className="space-y-3">
              {ONBOARDING_CHECKS.map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-cyan-500/15 border border-cyan-400/25 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[9px] font-mono text-cyan-400 font-bold">{i + 1}</span>
                  </div>
                  <p className="text-[13px] text-white/55 leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 pt-5 border-t border-white/6">
              <p className="text-[12px] text-white/30 font-mono mb-3">Required environment variables</p>
              <div className="space-y-1 font-mono text-[11px]">
                {[
                  ['NEXT_PUBLIC_SUPABASE_URL', 'your Supabase project URL'],
                  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public anon key'],
                  ['SUPABASE_SERVICE_ROLE_KEY', 'server-only service role key'],
                ].map(([key, hint]) => (
                  <div key={key} className="flex items-center gap-2 flex-wrap">
                    <code className="text-cyan-300">{key}</code>
                    <span className="text-white/25">—</span>
                    <span className="text-white/30">{hint}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────────── */}
      <section className="relative z-10 px-6 pb-32 text-center">
        <div className="max-w-xl mx-auto p-10 rounded-3xl bg-gradient-to-br from-cyan-500/8 via-violet-500/5 to-cyan-500/8 border border-cyan-400/15">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-violet-500/20 border border-cyan-400/20 flex items-center justify-center mx-auto mb-5">
            <Activity className="w-6 h-6 text-cyan-300" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Ready to explore?</h2>
          <p className="text-white/40 text-[14px] mb-7 leading-relaxed">
            Launch the dashboard and start building your private AI knowledge OS.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2.5 px-8 py-3.5 rounded-2xl
              bg-gradient-to-r from-cyan-500/25 to-violet-500/20
              border border-cyan-400/35 text-white font-semibold text-sm
              hover:from-cyan-500/35 hover:to-violet-500/30 transition-all"
          >
            <ArrowRight className="w-4 h-4 text-cyan-300" />
            Launch Dashboard
          </Link>
          <div className="flex items-center justify-center gap-4 mt-6 flex-wrap">
            {['No OpenAI key needed', 'Runs locally', 'Open source'].map((tag) => (
              <div key={tag} className="flex items-center gap-1.5 text-[11px] font-mono text-white/30">
                <CheckCircle className="w-3 h-3 text-emerald-400/60" />
                {tag}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/5 px-8 py-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-cyan-400/20 to-violet-500/20 border border-cyan-400/15 flex items-center justify-center">
            <Cpu className="w-2.5 h-2.5 text-cyan-300" />
          </div>
          <span className="text-[12px] font-bold text-white/30">Aivora</span>
        </div>
        <p className="text-[11px] text-white/20 font-mono">
          Built by{' '}
          <span className="text-cyan-400/60">Fokrul Islam</span>
          {' · '}Aivora v0.2.0
          {' · '}
          <a
            href="https://github.com/fokrulanthro16-eng/aivora"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/30 hover:text-cyan-400/60 transition-colors"
          >
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
