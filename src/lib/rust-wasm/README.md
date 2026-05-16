# Aivora — Rust/WASM Pipeline

This directory will house high-performance Rust modules compiled to WebAssembly,
integrated with the Next.js backend via Node.js WASM bindings.

---

## Planned Modules

### 1. Document Parsing (`aivora_parser`)

Parse binary document formats at native speed, entirely server-side.

**Functions:**
```typescript
parse_document_to_text(fileBytes: Uint8Array, mimeType: string): ParsedDocument
normalize_document_text(text: string): string
```

**Supported formats:**
- PDF: structured text extraction, page mapping
- DOCX: Word XML unpacking
- HTML: clean-room text extraction, link stripping
- Markdown: GFM normalization

---

### 2. High-Performance Chunking (`aivora_chunker`)

Token-aware semantic chunking with BPE tokenizer support.

**Functions:**
```typescript
chunk_text_semantically(text: string, options: ChunkOptions): Chunk[]
estimate_token_count(text: string): number
```

**Advantages over current JS chunker:**
- Exact BPE token counts (no 4-chars-per-token estimate)
- Semantic boundary detection using sentence embeddings
- Configurable sliding-window overlap
- 10x faster on large documents (>100 KB)

**`ChunkOptions` type:**
```typescript
type ChunkOptions = {
  maxTokens: number;
  overlap: number;
  minChunkLength: number;
  preserveCode: boolean;    // keep code blocks intact
  preserveHeaders: boolean; // split at heading boundaries
};
```

---

### 3. Local Reranking (`aivora_reranker`)

Cross-encoder reranker for improved retrieval precision.

**Functions:**
```typescript
compute_cosine_similarity(a: Float32Array, b: Float32Array): number
bm25_score(query: string, document: string, corpus_stats: CorpusStats): number
rerank_chunks(query: string, chunks: ScoredChunk[]): ScoredChunk[]
```

**Why Rust:** BM25 on large corpora requires tight loops; JS overhead is prohibitive.

---

### 4. Privacy-Preserving Local Pipeline (`aivora_privacy`)

Client-side document preprocessing that keeps sensitive content off the network.

**Functions:**
```typescript
sanitize_document(fileBytes: Uint8Array): SanitizedDoc  // strips PII before upload
normalize_for_embedding(text: string): string            // cleans text client-side
```

**Design:** Compiled to WASM, loaded in the browser, documents never leave the device
until after sanitization.

---

## Integration Pattern

```typescript
// TypeScript interface placeholder — swap the JS implementation for WASM below.
// import init, { chunk_text_semantically } from './pkg/aivora_chunker';

// await init(); // load WASM module once
// const chunks = chunk_text_semantically(text, { maxTokens: 512, overlap: 64 });
```

## Build Commands (future)

```bash
# Install Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install wasm-pack
cargo install wasm-pack

# Build each module
wasm-pack build crates/aivora_parser    --target nodejs --out-dir ../../src/lib/rust-wasm/pkg/parser
wasm-pack build crates/aivora_chunker   --target nodejs --out-dir ../../src/lib/rust-wasm/pkg/chunker
wasm-pack build crates/aivora_reranker  --target nodejs --out-dir ../../src/lib/rust-wasm/pkg/reranker
wasm-pack build crates/aivora_privacy   --target web    --out-dir ../../public/wasm/privacy
```

## Directory Structure (planned)

```
src/lib/rust-wasm/
├── README.md              ← this file
├── crates/
│   ├── aivora_parser/     ← PDF/DOCX/HTML parser
│   ├── aivora_chunker/    ← semantic chunker
│   ├── aivora_reranker/   ← BM25 + cosine reranker
│   └── aivora_privacy/    ← client-side sanitizer
└── pkg/                   ← compiled WASM output (git-ignored)
    ├── parser/
    ├── chunker/
    └── reranker/
```
