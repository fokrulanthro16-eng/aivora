/**
 * Server-only DOCX text extractor using mammoth.
 * extractRawText strips all formatting and returns plain prose,
 * which is exactly what the chunker and embedder need.
 */
export async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const extract = mammoth.default?.extractRawText ?? mammoth.extractRawText;
  const { value } = await (extract as (input: { buffer: Buffer }) => Promise<{ value: string }>)(
    { buffer },
  );
  return value;
}
