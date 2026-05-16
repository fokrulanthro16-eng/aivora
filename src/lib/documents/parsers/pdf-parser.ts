/**
 * Server-only PDF text extractor using pdf-parse v2 (PDFParse class API).
 * Dynamic import defers module evaluation so Turbopack never processes
 * pdf-parse's worker files at build time.
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  return result.text;
}
