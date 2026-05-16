@"
# Aivora — Autonomous Multimodal AI OS

> **Super-Intelligent · Autonomous · Multimodal · Privacy-First**

Aivora is a futuristic AI operating system built by **Fokrul Islam**.  
It combines **Supabase pgvector RAG**, **local embeddings**, **source citations**, **browser-local AI readiness**, **local memory**, and a holographic AI dashboard.

Aivora is designed to feel like an **AI OS**, not a simple chatbot wrapper.

---

## Why Aivora Exists

Modern AI apps often depend completely on external APIs. Aivora takes a different path.

It is designed around:

- local-first intelligence
- private embedding generation
- vector-based knowledge retrieval
- source-grounded answers
- optional browser-local LLM generation
- a sci-fi visual AI interface
- simple usability through the **Grandma Theory**

> **Grandma Theory:** Make advanced AI simple enough that anyone can understand and use it.

---

## Core Capabilities

| Capability | Technology | Purpose |
|---|---|---|
| Agent reasoning loop | Custom agent flow | Plan → Retrieve → Reflect → Self-Correct → Respond |
| Local embeddings | `@xenova/transformers` | Generate vectors without external embedding APIs |
| Vector database | Supabase `pgvector` | Store and search document chunks |
| Hybrid RAG | Vector + keyword search | Retrieve relevant grounded knowledge |
| Source citations | Citation panel | Reduce hallucination with verified sources |
| Browser-local AI | `@mlc-ai/web-llm` | Optional local answer generation in browser |
| Local memory | Dexie / IndexedDB | Store lightweight client-side memory |
| AI graph | React Flow | Visualize reasoning and system state |
| Holographic UI | Tailwind, Framer Motion, Three.js | Futuristic AI OS interface |

---

## Current Status

Aivora currently supports:

- Supabase connected RAG mode
- pgvector-based knowledge retrieval
- local embedding workflow
- seeded Aivora Knowledge Base
- verified citation panel
- deterministic source-grounded answers
- optional WebLLM local generation
- no required OpenAI, Anthropic, or Ollama dependency

---

## Tech Stack

Aivora is built with:

- **Next.js App Router**
- **TypeScript**
- **Tailwind CSS**
- **Framer Motion**
- **Supabase**
- **Supabase pgvector**
- **@xenova/transformers**
- **@mlc-ai/web-llm**
- **Dexie / IndexedDB**
- **React Flow**
- **Three.js / React Three Fiber**
- **Recharts**
- **Zod**

---

## Architecture

```txt
User Query
   ↓
Agent Planner
   ↓
Local Query Embedding
   ↓
Supabase pgvector Hybrid Search
   ↓
Retrieved Knowledge Chunks
   ↓
Reflection + Self-Correction
   ↓
Source-Grounded Answer
   ↓
Verified Citation Panel