import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { TypedConfigService } from '../../config/typed-config.service';
import { ResourceConflictException } from '../../common/exceptions/app.exception';
import type { IStorageProvider } from './storage.types';

const DEFAULT_EXPIRES = 300; // 5 min

/**
 * Storage em S3. Credenciais vêm da cadeia padrão do AWS SDK (env AWS_ACCESS_KEY_ID/
 * AWS_SECRET_ACCESS_KEY ou role anexada). Sem S3_BUCKET, fica desabilitado.
 */
@Injectable()
export class S3StorageProvider implements IStorageProvider {
  private readonly bucket?: string;
  private readonly client: S3Client;

  constructor(config: TypedConfigService) {
    this.bucket = config.get('S3_BUCKET');
    this.client = new S3Client({ region: config.get('S3_REGION') });
  }

  isConfigured(): boolean {
    return !!this.bucket;
  }

  private requireBucket(): string {
    if (!this.bucket) {
      throw new ResourceConflictException(
        'Storage de imagens não configurado (defina S3_BUCKET na API).',
      );
    }
    return this.bucket;
  }

  async presignUpload(
    key: string,
    contentType: string,
    expiresInSec = DEFAULT_EXPIRES,
  ): Promise<string> {
    const Bucket = this.requireBucket();
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket, Key: key, ContentType: contentType }),
      {
        expiresIn: expiresInSec,
      },
    );
  }

  async presignDownload(key: string, expiresInSec = DEFAULT_EXPIRES): Promise<string> {
    const Bucket = this.requireBucket();
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket, Key: key }), {
      expiresIn: expiresInSec,
    });
  }

  async downloadBytes(key: string): Promise<Buffer> {
    const Bucket = this.requireBucket();
    const result = await this.client.send(new GetObjectCommand({ Bucket, Key: key }));
    if (!result.Body) {
      throw new ResourceConflictException(`Objeto S3 "${key}" vazio.`);
    }
    // S3 SDK v3: Body é um ReadableStream Node.
    return Buffer.from(await result.Body.transformToByteArray());
  }
}
