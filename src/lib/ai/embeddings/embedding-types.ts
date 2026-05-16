export type EmbeddingVector = number[];

export type EmbedderStatus = 'unloaded' | 'loading' | 'ready' | 'error';

export type EmbedderConfig = {
  model: string;
  dimension: number;
  maxInputLength: number;
};
