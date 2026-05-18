import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { TypedConfigService } from './config/typed-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(PinoLogger));
  app.use(helmet());
  app.enableCors({ origin: true, credentials: true });
  app.enableShutdownHooks();

  const config = app.get(TypedConfigService);
  const port = config.get('PORT');
  const env = config.get('NODE_ENV');

  if (env !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('RPX Expert API')
      .setDescription('API de agendamento e gestão clínica — RPX Expert')
      .setVersion('0.1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(port);
  const logger = app.get(PinoLogger);
  logger.log(`RPX Expert API rodando em http://localhost:${port} (env=${env})`);
  if (env !== 'production') {
    logger.log(`Swagger em http://localhost:${port}/docs`);
  }
}

void bootstrap();
