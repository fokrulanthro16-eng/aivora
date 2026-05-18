# Aivora — Autonomous Multimodal AI OS

> **Super-Intelligent · Autonomous · Multimodal · Privacy-First**

Aivora is a futuristic AI operating system built by **Fokrul Islam**.
It combines **Supabase pgvector RAG**, **local embeddings**, **browser-local LLM inference**, **Tools Studio**, **PPTX/PDF export**, and a holographic AI dashboard — all without requiring OpenAI, Anthropic, Ollama, Groq, or any cloud AI API.

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript)](https://typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-pgvector-green?logo=supabase)](https://supabase.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## Features

| Feature | Description |
|---|---|
| **Hybrid-Cloud RAG** | Supabase pgvector combines vector similarity + keyword search for source-grounded answers |
| **Local Embeddings** | MiniLM-L6-v2 via `@xenova/transformers` — no embedding API required |
| **Browser-Local LLM** | Phi-3.5-mini via WebGPU generates answers entirely in your browser |
| **Tools Studio** | 13 AI workflows: Study Pack, Blog Post, Video Script, Storyboard, Knowledge Graph, Presentation, and more |
| **PPTX Export** | Download 10-slide presentations as real `.pptx` files via pptxgenjs |
| **PDF Export** | Research reports exported as formatted PDF via jsPDF |
| **Knowledge Vault** | Upload PDF, DOCX, images (OCR), SRT/VTT transcripts — chunked, embedded, and indexed |
| **Generated Outputs Library** | AI-generated outputs saved to Vault with type badges: PRESENTATION / SCRIPT / STUDY PACK / REPORT |
| **Source Citations** | Every RAG answer cites the source document chunk — verified, not hallucinated |
| **Agent Reasoning Graph** | React Flow visualization of the live reasoning trace |
| **Holographic Dashboard** | Three.js 3D orb, Framer Motion animations, and a sci-fi OS interface |
| **Local Memory** | Conversation history persisted in IndexedDB via Dexie |
| **Command Palette** | `Ctrl+K` to search and run any action |
| **Privacy-First** | No telemetry. Documents never leave your machine |

---

## Screenshots

> _Screenshots coming soon — run the demo locally to see the full dashboard._

| Landing Page | Dashboard | Tools Studio |
|---|---|---|
| `/ (landing)` | `/dashboard` | Studio tab → right panel |

---

## Demo Workflow

```
1. Upload a PDF or DOCX into the Knowledge Vault
        ↓
2. Aivora chunks and embeds it locally (MiniLM-L6-v2)
        ↓
3. Ask "Summarize this document" → source-grounded RAG answer with citations
        ↓
4. Open Tools Studio → "10-slide PPTX-ready presentation"
        ↓
5. Download the .pptx or export as PDF
        ↓
6. Output saved to Vault under "Generated Outputs"
```

---

## Architecture

```
User Query
   ↓
Agent Planner (plan → retrieve → reflect → self-correct → respond)
   ↓
Local Query Embedding (MiniLM-L6-v2 · @xenova/transformers)
   ↓
Supabase pgvector Hybrid Search (vector + keyword)
   ↓
Retrieved Knowledge Chunks
   ↓
Studio Workflow Builder OR RAG Synthesizer
   ↓
Source-Grounded Answer + Verified Citation Panel
   ↓
Export: PDF · .pptx · Markdown · Save to Vault
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 16.2 App Router | Full-stack server + client |
| Language | TypeScript (strict) | Type safety |
| Styling | Tailwind CSS v4, Framer Motion | Holographic UI |
| 3D / Viz | Three.js, React Three Fiber, React Flow | Holographic core + agent graph |
| Database | Supabase (PostgreSQL + pgvector) | Vector store + document metadata |
| Embeddings | `@xenova/transformers` MiniLM-L6-v2 | Local 384-dim embeddings |
| Browser LLM | `@mlc-ai/web-llm` Phi-3.5-mini | In-browser generation via WebGPU |
| PPTX Export | pptxgenjs | Client-side `.pptx` generation |
| PDF Export | jsPDF | Client-side PDF generation |
| Memory | Dexie / IndexedDB | Local conversation history |
| Validation | Zod | API schema validation |
| Charts | Recharts | Analytics panel |

---

## Setup

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project with pgvector enabled
- Chrome 113+ (for optional WebGPU / browser-local LLM)

### Install

```bash
git clone https://github.com/fokrulislam/aivora.git
cd aivora
npm install
```

### Environment variables

Copy the example file and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# ── Required: Supabase ──────────────────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ── Optional: External LLM (OpenAI-compatible) ──────────────────────────────
# Leave blank to use browser-local WebLLM (no cloud LLM cost)
AI_CHAT_BASE_URL=
AI_CHAT_API_KEY=
AI_CHAT_MODEL=gpt-4o-mini

# ── Optional: Custom local LLM model ───────────────────────────────────────
# NEXT_PUBLIC_LOCAL_LLM_MODEL=Phi-3.5-mini-instruct-q4f16_1-MLC
```

> **Security note:** `SUPABASE_SERVICE_ROLE_KEY` is server-only. It is never exposed to the browser. Only `NEXT_PUBLIC_*` variables are sent to the client.

### Supabase setup

Run this SQL in your Supabase SQL editor to create the required tables:

```sql
-- Enable pgvector
create extension if not exists vector;

-- Documents table
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  source_type text,
  source_url  text,
  file_name   text,
  tags        text[] default '{}',
  metadata    jsonb default '{}',
  created_at  timestamptz default now()
);

-- Document chunks table
create table if not exists document_chunks (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid references documents(id) on delete cascade,
  chunk_index  int not null,
  content      text not null,
  embedding    vector(384),
  token_count  int,
  page_number  int,
  metadata     jsonb default '{}',
  created_at   timestamptz default now()
);

-- Vector similarity search index
create index if not exists document_chunks_embedding_idx
  on document_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
```

### Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page.
Go to [http://localhost:3000/dashboard](http://localhost:3000/dashboard) to open the AI OS dashboard.

---

## Usage

### Chat (RAG mode)

Type any question in the chat panel. Aivora retrieves relevant chunks from your indexed documents and generates a source-grounded answer with citations.

### Knowledge Vault

Open the **Vault** tab in the right panel:

- Upload `.txt`, `.md`, `.pdf`, `.docx`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.srt`, `.vtt`
- Files are chunked, embedded locally, and stored in Supabase pgvector
- Use Quick Actions (Summarize, Timeline, Key People, FAQ…) per document
- Select 2+ documents for **Compare** or **Debate Mode**

### Tools Studio

Open the **Studio** tab in the right panel:

- **Research:** Auto Research Report, Study Pack, Action Items, Knowledge Graph
- **Presentation:** 10-slide PPTX-ready outline, Graphical Report
- **Media:** Blog Post, LinkedIn Post, GitHub README, Transcript Summary, Scene Breakdown, Video Script, Storyboard, Video Intelligence Report

### Exports

Every long-form response shows an export bar:

| Button | Output |
|---|---|
| Copy | Raw Markdown to clipboard |
| Markdown | Download `.md` file |
| PDF | Download formatted PDF via jsPDF |
| .pptx | Download 10-slide PPTX (presentation outputs only) |
| Save to Vault | Index the output as a searchable document |

### Browser-Local LLM

Click **Enable Local AI** in the chat header to load Phi-3.5-mini via WebGPU. Requires Chrome 113+ on a GPU-enabled device. Once loaded, generation is 100% local with no API cost.

---

## Roadmap

- [ ] Multi-user auth (Supabase RLS per user)
- [ ] Video/audio ingestion via transcription API
- [ ] Streaming RAG responses (Server-Sent Events)
- [ ] Aivora Mobile (React Native)
- [ ] Collaborative research sessions
- [ ] Custom embedding model selection in UI
- [ ] Automated knowledge graph builder
- [ ] Webhook support for ingestion pipelines
- [ ] One-click Vercel + Supabase deploy button

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss the proposal.

---

## License

[MIT](LICENSE) © Fokrul Islam
