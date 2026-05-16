import type { ParsedDocument } from '@/lib/types/document';

/**
 * Parse plain-text or markdown content into a normalized ParsedDocument.
 * Future: replaced by a Rust/WASM parser for binary formats (PDF, DOCX).
 */
export function parseTextContent(
  rawText: string,
  options: { stripMarkdown?: boolean } = {}
): ParsedDocument {
  let content = rawText;

  if (options.stripMarkdown) {
    // Remove common markdown syntax for cleaner chunking.
    content = content
      .replace(/#{1,6}\s+/g, '')         // headings
      .replace(/\*\*(.+?)\*\*/g, '$1')   // bold
      .replace(/\*(.+?)\*/g, '$1')       // italic
      .replace(/`{3}[\s\S]*?`{3}/g, '')  // code blocks
      .replace(/`(.+?)`/g, '$1')         // inline code
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
      .replace(/!\[.*?\]\(.+?\)/g, '');  // images
  }

  // Normalize whitespace.
  content = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Rough page count estimate (every 3000 chars ≈ 1 page).
  const pageCount = Math.max(1, Math.ceil(content.length / 3000));

  const title = extractTitleFromText(content);

  return { title, content, metadata: {}, pageCount };
}

function extractTitleFromText(text: string): string {
  const firstLine = text.split('\n')[0]?.trim() ?? '';
  // Use first line if it looks like a title (short, not ending in punctuation).
  if (firstLine.length > 0 && firstLine.length < 120 && !/[.!?]$/.test(firstLine)) {
    return firstLine;
  }
  return 'Untitled Document';
}
