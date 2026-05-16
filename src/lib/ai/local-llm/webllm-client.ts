// Browser-only — NEVER import this file in any server route or API handler.
// Uses WebGPU via @mlc-ai/web-llm to run inference entirely in the browser.
// No API key required. Model is cached in the browser after first download.

import type { MLCEngine } from '@mlc-ai/web-llm';

export type LoadProgressCallback = (progress: number, text: string) => void;

let _engine: MLCEngine | null = null;
let _loadingPromise: Promise<MLCEngine> | null = null;

export function isWebGPUSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'gpu' in navigator;
}

export function isModelLoaded(): boolean {
  return _engine !== null;
}

export async function getWebLLMEngine(
  onProgress?: LoadProgressCallback
): Promise<MLCEngine> {
  if (_engine) return _engine;
  if (_loadingPromise) return _loadingPromise;

  if (!isWebGPUSupported()) {
    throw new Error(
      'WebGPU not supported. Try Chrome 113+ or Edge 113+ on a GPU-enabled device.'
    );
  }

  _loadingPromise = (async () => {
    const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
    const modelId =
      process.env.NEXT_PUBLIC_LOCAL_LLM_MODEL ?? 'Phi-3.5-mini-instruct-q4f16_1-MLC';
    const engine = await CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        onProgress?.(report.progress, report.text);
      },
    });
    _engine = engine;
    return engine;
  })();

  return _loadingPromise;
}

export async function generateWithWebLLM(
  query: string,
  options: {
    context?: string;
    onProgress?: LoadProgressCallback;
    maxTokens?: number;
  } = {}
): Promise<string> {
  const { context, onProgress, maxTokens = 512 } = options;
  const engine = await getWebLLMEngine(onProgress);

  const systemContent = context?.trim()
    ? `You are Aivora, an autonomous AI OS assistant built by Fokrul Islam.\n\nUse the following retrieved knowledge to answer the user's question accurately and concisely. Cite only what is in the context.\n\n--- CONTEXT ---\n${context}\n--- END CONTEXT ---`
    : `You are Aivora, an autonomous multimodal AI OS built by Fokrul Islam. You run entirely in the user's browser using WebGPU-accelerated WebLLM — no external API keys required. Answer helpfully and concisely about Aivora, AI systems, or general topics.`;

  const response = await engine.chat.completions.create({
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: query },
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() ?? '(no response generated)';
}

export function resetWebLLM(): void {
  _engine = null;
  _loadingPromise = null;
}
