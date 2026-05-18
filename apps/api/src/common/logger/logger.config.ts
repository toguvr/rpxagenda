import type { Params } from 'nestjs-pino';
import type { Env } from '../../config/env.schema';

export function buildLoggerOptions(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Params {
  const isDev = env.NODE_ENV === 'development';
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      autoLogging: true,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.refreshToken',
          'res.headers["set-cookie"]',
          '*.password',
          '*.passwordHash',
          '*.tokenHash',
        ],
        censor: '[redacted]',
      },
      transport: isDev
        ? {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname,req,res,responseTime',
              messageFormat: '{msg} {req.method} {req.url} {res.statusCode} ({responseTime}ms)',
            },
          }
        : undefined,
    },
  };
}
