/**
 * Local Embedder using @xenova/transformers.
 *
 * Privacy benefit: text never leaves the server process.
 * The model runs entirely in Node.js via ONNX Runtime — no calls to
 * OpenAI, Cohere, or any external embedding service.
 */

import { AIVORA_CONFIG } from '@/config/aivora';
import type { EmbeddingVector } from './embedding-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FeatureExtractionPipeline = (texts: string | string[], options?: Record<string, unknown>) => Promise<any>;

const MODEL_ID = AIVORA_CONFIG.ai.embeddingModel;
const MAX_INPUT_LENGTH = 512;

// Module-level singleton: the pipeline loads once and is reused across requests.
let pipelineInstance: FeatureExtractionPipeline | null = null;
let loadingPromise: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (pipelineInstance) return pipelineInstance;

  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    // Dynamic import keeps the heavy ONNX runtime out of client bundles.
    const { pipeline, env } = await import('@xenova/transformers');

    // Keep model files in the local cache, never phone home.
    env.allowRemoteModels = true;
    env.localModelPath = './public/models';

    const pipe = await pipeline('feature-extraction', MODEL_ID, {
      quantized: true,
    }) as FeatureExtractionPipeline;

    pipelineInstance = pipe;
    return pipe;
  })();

  return loadingPromise;
}

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;
  return vector.map((v) => v / magnitude);
}

function truncateText(text: string): string {
  // Rough guard: 4 chars ≈ 1 token for English text.
  const maxChars = MAX_INPUT_LENGTH * 4;
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

/**
 * Embed a single text string.
 * Returns a normalized 384-dimensional vector.
 */
export async function embedText(text: string): Promise<EmbeddingVector> {
  if (!text || text.trim().length === 0) {
    throw new Error('embedText: input text must not be empty.');
  }

  const safeText = truncateText(text.trim());
  const pipe = await getPipeline();

  const output = await pipe(safeText, { pooling: 'mean', normalize: true });

  // output.data is a Float32Array; convert to plain number[]
  const vector = Array.from(output.data as Float32Array) as number[];
  return normalizeVector(vector);
}

/**
 * Embed multiple texts in sequence (no batching — keeps memory stable in serverless).
 * Returns an array of normalized 384-dimensional vectors.
 */
export async function embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
  if (!texts || texts.length === 0) {
    throw new Error('embedBatch: texts array must not be empty.');
  }

  const pipe = await getPipeline();
  const results: EmbeddingVector[] = [];

  for (const text of texts) {
    if (!text || text.trim().length === 0) {
      throw new Error('embedBatch: one or more input texts are empty.');
    }

    const safeText = truncateText(text.trim());
    const output = await pipe(safeText, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data as Float32Array) as number[];
    results.push(normalizeVector(vector));
  }

  return results;
}

/** Warm up the pipeline on first server start (optional call from startup). */
export async function warmUpEmbedder(): Promise<void> {
  await getPipeline();
}
