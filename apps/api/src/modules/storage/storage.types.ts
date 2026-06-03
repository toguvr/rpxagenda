/**
 * Abstração de storage (CLAUDE.md §2.2/§2.3 — provider pattern).
 * Implementação inicial: S3. Trocar para R2/outro não deve afetar a regra de negócio.
 */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface IStorageProvider {
  /** True se o storage está configurado (bucket definido). */
  isConfigured(): boolean;
  /** URL assinada para upload (PUT) direto pelo cliente. */
  presignUpload(key: string, contentType: string, expiresInSec?: number): Promise<string>;
  /** URL assinada para leitura (GET). */
  presignDownload(key: string, expiresInSec?: number): Promise<string>;
  /** Baixa o objeto e devolve os bytes (usado para encaminhar imagem ao iDFace). */
  downloadBytes(key: string): Promise<Buffer>;
}
