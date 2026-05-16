import { AIVORA_CONFIG, isSupabaseConfigured, isExternalLLMConfigured } from '@/config/aivora';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const supabaseOk = isSupabaseConfigured();
  const llmOk = isExternalLLMConfigured();

  // Healthy when Supabase is connected — browser WebLLM covers generation.
  const status = supabaseOk ? 'healthy' : 'degraded';

  return Response.json(
    {
      status,
      product: AIVORA_CONFIG.product.name,
      version: AIVORA_CONFIG.product.version,
      timestamp: new Date().toISOString(),
      services: {
        supabase: supabaseOk ? 'configured' : 'missing',
        llm: llmOk ? 'external' : 'local-webllm',
        embedder: 'local_xenova',
      },
      envCheck: {
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasExternalLLM: llmOk,
      },
    },
    { status: supabaseOk ? 200 : 503 }
  );
}
