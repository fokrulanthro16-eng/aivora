import { AIVORA_CONFIG } from '@/config/aivora';
import type { ChunkingOptions } from '@/lib/types/document';

export type TextChunk = {
  index: number;
  content: string;
  tokenCount: number;
  startChar: number;
  endChar: number;
};

/**
 * Token-aware text chunker with sliding-window overlap.
 *
 * Uses sentence boundaries as natural split points whenever possible.
 * Future: replace inner split logic with Rust/WASM semantic chunker
 * for precise BPE token counting and semantic boundary detection.
 */
export function chunkText(text: string, options: ChunkingOptions = {}): TextChunk[] {
  const {
    maxTokens = AIVORA_CONFIG.chunking.defaultMaxTokens,
    overlap = AIVORA_CONFIG.chunking.defaultOverlap,
    minChunkLength = AIVORA_CONFIG.chunking.minChunkLength,
  } = options;

  // Rough token estimate: 1 token ≈ 4 chars (English average).
  const maxChars = maxTokens * AIVORA_CONFIG.chunking.avgCharsPerToken;
  const overlapChars = overlap * AIVORA_CONFIG.chunking.avgCharsPerToken;

  // Split on sentence boundaries.
  const sentences = splitIntoSentences(text);

  const chunks: TextChunk[] = [];
  let currentChunk = '';
  let currentStart = 0;
  let charCursor = 0;

  for (const sentence of sentences) {
    const sentLen = sentence.length;

    if (currentChunk.length + sentLen > maxChars && currentChunk.length >= minChunkLength) {
      // Flush current chunk.
      const trimmed = currentChunk.trim();
      if (trimmed.length >= minChunkLength) {
        chunks.push({
          index: chunks.length,
          content: trimmed,
          tokenCount: estimateTokens(trimmed),
          startChar: currentStart,
          endChar: currentStart + trimmed.length,
        });
      }

      // Start new chunk with overlap from the tail of the previous chunk.
      const overlapText = currentChunk.slice(-overlapChars);
      currentStart = charCursor - overlapText.length;
      currentChunk = overlapText + sentence;
    } else {
      currentChunk += sentence;
    }

    charCursor += sentLen;
  }

  // Flush any remaining text.
  const remaining = currentChunk.trim();
  if (remaining.length >= minChunkLength) {
    chunks.push({
      index: chunks.length,
      content: remaining,
      tokenCount: estimateTokens(remaining),
      startChar: currentStart,
      endChar: currentStart + remaining.length,
    });
  }

  return chunks;
}

function splitIntoSentences(text: string): string[] {
  // Split on '. ', '! ', '? ', '\n\n' — preserving delimiter in output.
  return text.split(/(?<=[.!?])\s+|(?<=\n)\n/).map((s) => s + ' ').filter(Boolean);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / AIVORA_CONFIG.chunking.avgCharsPerToken);
}
