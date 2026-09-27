import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { TransformInterceptor } from './common/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false, rawBody: true });

  const allowedOrigins = new Set(
    (process.env.FRONTEND_URL ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  if (allowedOrigins.size === 0) {
    throw new Error('FRONTEND_URL must list at least one allowed origin (comma separated).');
  }

  app.use(helmet());
  app.enableCors({
    // Fail closed: without an explicit allowlist, do not answer cross-origin requests at all.
    // The previous `origin: true` fallback reflected any Origin header back, which turns a
    // credentialed CORS misconfiguration into account takeover.
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.setGlobalPrefix('api');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('FlyConnect API')
    .setDescription('Travel agency WhatsApp automation API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // API docs expose the full route map and every DTO shape. Never serve them in production.
  if (process.env.NODE_ENV !== 'production') {
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`FlyConnect API running on http://localhost:${port}/api`);
}

bootstrap();
