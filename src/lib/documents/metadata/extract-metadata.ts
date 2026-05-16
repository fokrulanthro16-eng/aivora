type MetadataInput = {
  title?: string;
  file_name?: string;
  source_url?: string;
};

type ExtractedMetadata = {
  charCount: number;
  wordCount: number;
  extractedAt: string;
  title?: string;
  fileName?: string;
  sourceUrl?: string;
  language: string;
};

/**
 * Extract lightweight metadata from document text.
 * Future: route through Rust/WASM for binary format metadata (EXIF, PDF meta, etc.).
 */
export function extractMetadata(content: string, input: MetadataInput = {}): ExtractedMetadata {
  const words = content.trim().split(/\s+/).filter(Boolean);

  return {
    charCount: content.length,
    wordCount: words.length,
    extractedAt: new Date().toISOString(),
    title: input.title,
    fileName: input.file_name,
    sourceUrl: input.source_url,
    language: 'en',
  };
}
