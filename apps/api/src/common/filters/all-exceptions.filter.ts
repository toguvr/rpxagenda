import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppException } from '../exceptions/app.exception';

export interface ErrorResponseBody {
  statusCode: number;
  message: string;
  code: string;
  details?: unknown;
  path: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toErrorBody(exception, request.url);

    if (body.statusCode >= 500) {
      this.logger.error(
        { err: exception, path: request.url, code: body.code },
        body.message,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorBody(exception: unknown, path: string): ErrorResponseBody {
    const timestamp = new Date().toISOString();

    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        message: exception.message,
        code: exception.code,
        details: exception.details,
        path,
        timestamp,
      };
    }

    if (exception instanceof ZodError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Erro de validação',
        code: 'VALIDATION_ERROR',
        details: exception.issues.map((i) => ({
          path: i.path,
          message: i.message,
          code: i.code,
        })),
        path,
        timestamp,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : (res as { message?: string | string[] }).message
            ? Array.isArray((res as { message: string | string[] }).message)
              ? ((res as { message: string[] }).message[0] ?? exception.message)
              : ((res as { message: string }).message)
            : exception.message;

      return {
        statusCode: status,
        message,
        code: this.httpStatusToCode(status),
        details: typeof res === 'object' ? res : undefined,
        path,
        timestamp,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor',
      code: 'INTERNAL_ERROR',
      path,
      timestamp,
    };
  }

  private httpStatusToCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'UNPROCESSABLE_ENTITY';
      default:
        return status >= 500 ? 'INTERNAL_ERROR' : 'ERROR';
    }
  }
}
