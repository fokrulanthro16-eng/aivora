/**
 * PDF Parser — placeholder for Rust/WASM implementation.
 *
 * This module currently accepts pre-extracted text from PDF files.
 * A high-performance binary PDF parser will be added via the Rust/WASM
 * pipeline described in src/lib/rust-wasm/README.md.
 *
 * Signature preserved for future swap-in.
 */

import type { ParsedDocument } from '@/lib/types/document';
import { parseTextContent } from './text-parser';

export type PdfParseOptions = {
  extractedText: string;
  fileName?: string;
  pageCount?: number;
};

export function parsePdfContent(options: PdfParseOptions): ParsedDocument {
  const { extractedText, fileName, pageCount } = options;

  const parsed = parseTextContent(extractedText);

  return {
    ...parsed,
    pageCount: pageCount ?? parsed.pageCount,
    metadata: {
      ...parsed.metadata,
      fileName: fileName ?? null,
      parserVersion: 'text-fallback-v1',
    },
  };
}
