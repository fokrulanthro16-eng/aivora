# Aivora — Autonomous AI OS

> **Super-Intelligent · Autonomous · Multimodal · Privacy-First**
>
> A production-grade AI operating system that runs a complete reasoning loop — Plan → Retrieve → Reflect → Self-Correct → Respond — entirely without requiring external LLM API keys.

**Developer:** Fokrul Islam  
**Design Philosophy:** *Grandma Theory* — make advanced AI so simple that anyone can understand and use it.

---

## What is Aivora?

Aivora is not a chatbot wrapper. It is an **autonomous AI OS** with:

- A real **agentic reasoning loop** (5 steps, not one LLM call)
- **Hybrid RAG** — 70% vector similarity + 30% keyword trigram search via Supabase pgvector
- **Local browser AI** using WebGPU + `@mlc-ai/web-llm` — Phi-3.5-mini runs entirely in your browser
- **Privacy-first** — embeddings never leave your machine; LLM answers can be generated in-browser
- **Visual AI OS** — holographic 3D core, live reasoning timeline, agent graph, command palette

---

## Key Features

| Feature | Technology | Notes |
|---|---|---|
| Autonomous Reasoning | Custom agent loop | Plan → Retrieve → Reflect → Self-Correct → Respond |
| Local Embeddings | `@xenova/transformers` (MiniLM-L6) | Runs in Node.js server, no API key |
| Browser LLM | `@mlc-ai/web-llm` (Phi-3.5-mini) | WebGPU — no API key, no server |
| Hybrid Search | Supabase pgvector + pg_trgm | 0.70×vector + 0.30×keyword |
| Local Memory | Dexie (IndexedDB) | Conversation history in your browser |
| 3D Holographic Core | Three.js + React Three Fiber | Phase-reactive 3D visualization |
| Neural Agent Graph | React Flow | Live reasoning graph with animated nodes |
| System Analytics | Recharts | Confidence gauges, latency, privacy indicators |
| Command Palette | Framer Motion | Ctrl+K — like a real OS |
| Grounded Citations | Custom anti-hallucination layer | Never fabricates sources |

---

## Architecture

```
Browser (Client)                    Server (Next.js Node.js)
─────────────────────────────       ─────────────────────────────
  WebGPU / @mlc-ai/web-llm           @xenova/transformers
  Dexie (IndexedDB memory)           Local embeddings (MiniLM-L6)
  Three.js 3D UI                     Supabase pgvector (hybrid search)
  React Flow agent graph             Agentic reasoning loop (5 steps)
  Recharts analytics                 /api/agent · /api/documents/*
  Framer Motion                      /api/health
```

**No OpenAI. No Anthropic. No Ollama required.**

---

## Hybrid AI Flow

When you ask Aivora a question:

```
1. /api/agent called
   ├─ Supabase + LLM configured?
   │   YES → Full RAG Mode  (server embeddings + server LLM)
   │   NO  → Demo Mode detected
   │           └─ WebGPU available in browser?
   │               YES → Local WebLLM Mode (Phi-3.5-mini in browser)
   │               NO  → Demo Mode (explains setup)
   │
2. Backend returns reasoning trace + citations regardless of mode
3. Citations are always grounded in real retrieved chunks
4. Answer is saved to IndexedDB (local memory)
```

### AI Modes

| Mode | Badge | Description |
|---|---|---|
| **RAG Mode** | Cyan | Full Supabase + server LLM pipeline |
| **Local WebLLM** | Violet | Answer generated in your browser via WebGPU |
| **Demo Mode** | Amber | Backend demo response (no keys needed) |
| **Error-Safe** | Red | Graceful fallback — never crashes |

---

## Privacy-First Design

- **Local Embeddings** — MiniLM-L6 runs inside Next.js Node.js process; your text never reaches an embedding API
- **Browser LLM** — When WebGPU is available, Phi-3.5-mini runs entirely in your browser tab
- **No External LLM API** — Works out of the box in demo mode and local-webllm mode without any API keys
- **Supabase is optional** — Used only for the knowledge base vector store; not required for the UI to function
- **Service role key is server-only** — Never exposed to the browser; all pgvector queries go through server-side routes

---

## Tech Stack

**Frontend**
- Next.js 16.2 (App Router, Turbopack)
- React 19 + TypeScript strict mode
- Tailwind CSS v4 + Framer Motion v12
- Three.js + React Three Fiber v9 (3D holographic core)
- React Flow v11 (agent reasoning graph)
- Recharts v3 (analytics)
- Sonner (toasts)
- Dexie v4 (IndexedDB local memory)

**AI / ML**
- `@xenova/transformers` — local sentence embeddings (ONNX, server-side)
- `@mlc-ai/web-llm` — browser-native LLM via WebGPU
- Custom 5-step agentic reasoning loop

**Backend**
- Supabase (PostgreSQL + pgvector extension)
- `pg_trgm` for trigram keyword similarity
- HNSW index for approximate nearest-neighbor search

---

## Screenshots

> _Dashboard coming soon — run locally to experience the full holographic UI._

---

## Setup Instructions

### Prerequisites

- Node.js 20+
- A Supabase project (optional — app works without it in demo/local-webllm mode)
- Chrome 113+ or Edge 113+ for Local WebLLM mode (requires WebGPU)

### 1. Clone and Install

```bash
git clone https://github.com/fokrulislam/aivora
cd aivora
npm install
```

### 2. Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# Required for RAG mode (optional for demo/local-webllm mode)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Optional — external LLM endpoint (OpenAI-compatible)
# Leave empty to use Local WebLLM / Demo mode instead
AI_CHAT_BASE_URL=
AI_CHAT_API_KEY=
AI_CHAT_MODEL=

# Local browser AI model (downloaded once, cached in browser)
NEXT_PUBLIC_LOCAL_LLM_MODEL=Phi-3.5-mini-instruct-q4f16_1-MLC

# Local embeddings model (no API key needed)
NEXT_PUBLIC_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
```

### 3. Supabase Setup (optional)

Run the setup SQL in your Supabase SQL editor:

```bash
# All-in-one setup (extensions + tables + indexes + hybrid search RPC)
cat scripts/setup-supabase.sql
```

Or run migrations individually from `supabase/migrations/`.

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The app redirects to `/dashboard` automatically.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | For RAG | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | For RAG | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | For RAG | Server-only service role key — never exposed to browser |
| `AI_CHAT_BASE_URL` | For RAG | OpenAI-compatible chat endpoint |
| `AI_CHAT_API_KEY` | For RAG | API key for the chat endpoint |
| `AI_CHAT_MODEL` | For RAG | Model name (e.g. `gpt-4o-mini`) |
| `NEXT_PUBLIC_LOCAL_LLM_MODEL` | Optional | WebLLM model ID for browser AI |
| `NEXT_PUBLIC_EMBEDDING_MODEL` | Optional | HuggingFace model for local embeddings |

---

## Uploading Knowledge

```bash
curl -X POST http://localhost:3000/api/documents/upload \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Document",
    "content": "Full document text here...",
    "source_type": "txt"
  }'
```

Returns `{ documentId, chunkCount }` on success.

---

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/agent` | POST | Run the autonomous reasoning loop |
| `/api/health` | GET | Check all service statuses |
| `/api/documents/upload` | POST | Embed and store a document |
| `/api/documents/search` | POST | Hybrid semantic + keyword search |

---

## Roadmap

- [ ] PDF/DOCX upload support
- [ ] Streaming WebLLM responses
- [ ] Multi-turn conversation context window
- [ ] Rust/WASM cross-encoder reranker (4× speed improvement)
- [ ] Admin document management UI
- [ ] User authentication + per-user knowledge bases
- [ ] Voice input (Web Speech API)
- [ ] Multi-agent orchestration

---

## Contributing

PRs welcome. Please follow the existing TypeScript strict conventions and ensure `npm run build` passes before submitting.

---

## License

MIT — free to use, modify, and build upon.

---

*Built with obsession by **Fokrul Islam** — Grandma Theory: if your grandmother can't understand the AI, you haven't built it well enough.*
