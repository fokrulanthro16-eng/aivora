import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @xenova/transformers uses Node.js ONNX Runtime native modules.
  // Marking as external prevents Turbopack from bundling native .node binaries.
  serverExternalPackages: ['@xenova/transformers', 'onnxruntime-node', 'pdf-parse', 'mammoth'],

  // Turbopack is the default bundler in Next.js 16.
  // Empty config satisfies the type; resolveAlias handles fs/path mocks if needed.
  turbopack: {
    resolveAlias: {
      // Prevent Turbopack from resolving Node built-ins in browser bundles.
      // (Only matters for client components; server routes are Node-only anyway.)
      'node:fs': { browser: '@/lib/stubs/empty' },
      'node:path': { browser: '@/lib/stubs/empty' },
    },
  },
};

export default nextConfig;
