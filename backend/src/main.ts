import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { AppValidationException } from './common/exceptions/app-exceptions';
import { flattenValidationErrors } from './common/helpers/validation-errors.helper';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  // 6. CORS
  const config = app.get(ConfigService);
  const appUrl = config.getOrThrow<string>('APP_URL');
  app.enableCors({
    origin: appUrl,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 7. Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Trackero API')
    .setVersion('1.0')
    .setDescription('Open-source agile project management')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/api-docs', app, swaggerDocument, {
    swaggerOptions: { persistAuthorization: true },
  });

  // 8. Start
  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  console.log(`Trackero running on port ${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/api-docs`);
}

bootstrap();
