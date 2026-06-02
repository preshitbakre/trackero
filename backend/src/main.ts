import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { existsSync } from 'fs';

import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { AppValidationException } from './common/exceptions/app-exceptions';
import { flattenValidationErrors } from './common/helpers/validation-errors.helper';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  // 0. Body size limits (memory-DoS guard) — must run before other middleware
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ limit: '1mb', extended: true }));

  // 1. Global prefix
  app.setGlobalPrefix('api');

  // 2. Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: (errors) => {
        const validationErrors = flattenValidationErrors(errors);
        return new AppValidationException(validationErrors);
      },
    }),
  );

  // 3. Response envelope interceptor
  app.useGlobalInterceptors(
    new ResponseEnvelopeInterceptor(app.get(Reflector)),
  );

  // 4. Exception filter (must be last)
  app.useGlobalFilters(new HttpExceptionFilter());

  // 5. Security
  app.use(helmet());

  // 6. CORS — support comma-separated CORS_ORIGINS env var, fall back to APP_URL
  const config = app.get(ConfigService);
  const appUrl = config.getOrThrow<string>('APP_URL');
  const corsOriginsEnv = config.get<string>('CORS_ORIGINS');
  const corsOrigin: string | string[] = corsOriginsEnv
    ? corsOriginsEnv.split(',').map((o) => o.trim()).filter(Boolean)
    : appUrl;
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 7. Swagger — always on in non-production; in production, opt-in via SWAGGER_ENABLED=true
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const swaggerEnabled = !isProduction || config.get<string>('SWAGGER_ENABLED') === 'true';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Trackero API')
      .setVersion('1.0')
      .setDescription('Open-source agile project management')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, swaggerDocument, {
      swaggerOptions: { persistAuthorization: true },
      useGlobalPrefix: true,
    });
  }

  // 8. Serve frontend static files in production (single-container deploys only)
  const publicPath = join(__dirname, '..', 'public');
  if (config.get<string>('NODE_ENV') === 'production' && existsSync(publicPath)) {
    app.useStaticAssets(publicPath);
    app.use((req: any, res: any, next: any) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
        res.sendFile(join(publicPath, 'index.html'));
      } else {
        next();
      }
    });
  }

  // Start
  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  logger.log(`Trackero running on port ${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
