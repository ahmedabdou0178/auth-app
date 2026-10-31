import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfig } from './app-config.js';
import { validateEnv } from './env.schema.js';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      // Scripts run from server/; the single .env lives at the repo root.
      envFilePath: ['../.env', '.env'],
      // Only local development reads .env. Tests and production get their environment
      // explicitly, so a developer's .env can never leak into them.
      ignoreEnvFile: process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'production',
      validate: validateEnv,
    }),
  ],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
