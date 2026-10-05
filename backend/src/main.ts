import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { createDriveClientFromEnv } from './backup/google-drive.service-account';
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

  // Known placeholder values from .env.example are rejected outright. A length-only check is
  // not enough: those placeholders are long enough to pass it, so copying .env.example verbatim
  // would sign every JWT in the fleet with a secret published in this repository.
  const INSECURE_SECRET_MARKERS = [
    'change-me',
    'changeme',
    'replace-me',
    'your-',
    'placeholder',
    'example',
    'secret',
    'long-random',
  ];

  const assertStrongSecret = (name: string, value: string | undefined, minLength: number) => {
    if (!value) {
      throw new Error(`${name} must be configured.`);
    }
    const lowered = value.toLowerCase();
    if (INSECURE_SECRET_MARKERS.some((marker) => lowered.includes(marker))) {
      throw new Error(`${name} still contains a placeholder value from .env.example. Generate a real random secret.`);
    }
    if (value.length < minLength) {
      throw new Error(`${name} must be at least ${minLength} characters long.`);
    }
  };

  assertStrongSecret('JWT_SECRET', process.env.JWT_SECRET, 32);
  assertStrongSecret('JWT_REFRESH_SECRET', process.env.JWT_REFRESH_SECRET, 32);

  const appEnv = process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development';
  if (appEnv === 'production') {
    if (!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      throw new Error(
        'WHATSAPP_WEBHOOK_VERIFY_TOKEN must be set in production. Webhook verification fails closed without it.',
      );
    }
    if (!process.env.WHATSAPP_WEBHOOK_APP_SECRET && !process.env.WHATSAPP_META_APP_SECRET) {
      throw new Error(
        'WHATSAPP_WEBHOOK_APP_SECRET (or WHATSAPP_META_APP_SECRET) must be set in production.',
      );
    }

    const drive = createDriveClientFromEnv();
    const rawSa = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ?? '').toLowerCase();
    if (
      !drive.isConfigured() ||
      !drive.folderId ||
      INSECURE_SECRET_MARKERS.some((m) => rawSa.includes(m) || drive.email.toLowerCase().includes(m) || (drive.folderId ?? '').toLowerCase().includes(m))
    ) {
      throw new Error(
        'Google Drive backup credentials (GOOGLE_SERVICE_ACCOUNT_KEY_PATH or GOOGLE_SERVICE_ACCOUNT_JSON) and GOOGLE_DRIVE_FOLDER_ID must be configured in production without placeholder values.',
      );
    }
  }

  app.enableShutdownHooks();

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

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
