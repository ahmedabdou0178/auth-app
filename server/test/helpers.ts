import type { TestingModuleBuilder } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Response } from 'supertest';

export const ORIGIN = 'http://localhost:5173';
export const STRONG_PASSWORD = 'Secr3t!pass';

export interface TestContext {
  app: NestExpressApplication;
  close: () => Promise<void>;
}

/**
 * Boots the real AppModule + HTTP pipeline against a fresh in-memory MongoDB.
 * `env` is applied before the app is imported (ConfigModule validates at import time).
 */
export async function createTestApp(
  env: Record<string, string> = {},
  override?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<TestContext> {
  const mongo = await MongoMemoryServer.create();
  Object.assign(process.env, { MONGODB_URI: mongo.getUri('auth') }, env);

  const { AppModule } = await import('../src/app.module.js');
  const { configureApp } = await import('../src/configure-app.js');

  const builder = Test.createTestingModule({ imports: [AppModule] });
  const moduleRef = await (override ? override(builder) : builder).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    bufferLogs: true,
  });
  configureApp(app);
  await app.init();

  return {
    app,
    close: async () => {
      await app.close();
      await mongo.stop();
    },
  };
}

export interface ParsedCookie {
  value: string;
  attributes: string[];
}

/** `Set-Cookie` headers by cookie name. */
export function setCookies(res: Response): Map<string, ParsedCookie> {
  const header = res.headers['set-cookie'] as unknown;
  const lines = Array.isArray(header) ? (header as string[]) : [];
  return new Map(
    lines.map((line) => {
      const [pair = '', ...attributes] = line.split(';').map((part) => part.trim());
      const separator = pair.indexOf('=');
      return [
        pair.slice(0, separator),
        { value: pair.slice(separator + 1), attributes: attributes.map((a) => a.toLowerCase()) },
      ];
    }),
  );
}

export function cookieValue(res: Response, name: string): string {
  const cookie = setCookies(res).get(name);
  if (!cookie) throw new Error(`Response did not set cookie ${name}`);
  return cookie.value;
}

let counter = 0;
export function uniqueEmail(prefix = 'user'): string {
  counter += 1;
  return `${prefix}${String(Date.now())}${String(counter)}@example.com`;
}
