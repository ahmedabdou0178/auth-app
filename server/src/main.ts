// Must stay first: instrumentations patch modules before they are loaded.
import './instrumentation.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';
import { configureApp } from './configure-app.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    // JSON parsing runs in JsonBodyMiddleware so its errors reach the exception filter.
    bodyParser: false,
  });
  configureApp(app);
  await app.listen(app.get(AppConfig).get('PORT'));
}

void bootstrap();
