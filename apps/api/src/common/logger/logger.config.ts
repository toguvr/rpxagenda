import type { Params } from 'nestjs-pino';
import type { Env } from '../../config/env.schema';

export function buildLoggerOptions(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Params {
  const isDev = env.NODE_ENV === 'development';
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      // Ignora o healthcheck do load balancer (GET / pelo ELB-HealthChecker),
      // que a cada 10s afoga o log e impede ver o tráfego real (ex: polls /push).
      autoLogging: {
        ignore: (req) => {
          const ua = (req.headers?.['user-agent'] as string | undefined) ?? '';
          if (req.url === '/' || ua.startsWith('ELB-HealthChecker')) return true;
          // Polls GET /push do iDFace são a cada poucos seg e afogam o log; o
          // poll relevante (comando entregue) é logado manualmente no controller.
          const url = req.url ?? '';
          return (
            req.method === 'GET' &&
            (url.startsWith('/push') || url.startsWith('/webhooks/idface/push'))
          );
        },
      },
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
