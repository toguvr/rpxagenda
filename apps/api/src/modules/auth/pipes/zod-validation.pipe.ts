import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          message: 'Erro de validação',
          code: 'VALIDATION_ERROR',
          issues: err.issues.map((i) => ({
            path: i.path,
            message: i.message,
            code: i.code,
          })),
        });
      }
      throw err;
    }
  }
}
