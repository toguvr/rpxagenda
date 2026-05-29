import { Global, Module } from '@nestjs/common';
import { S3StorageProvider } from './s3-storage.provider';
import { STORAGE_PROVIDER } from './storage.types';

/**
 * Provê o IStorageProvider (S3) globalmente. Trocar de provider = trocar o useClass.
 */
@Global()
@Module({
  providers: [{ provide: STORAGE_PROVIDER, useClass: S3StorageProvider }],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
