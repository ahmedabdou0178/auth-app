import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { shutdownTelemetry } from '../../instrumentation.js';

/** Flushes OpenTelemetry exporters when Nest shuts down (SIGTERM via enableShutdownHooks). */
@Injectable()
export class TelemetryShutdown implements OnApplicationShutdown {
  onApplicationShutdown(): Promise<void> {
    return shutdownTelemetry();
  }
}
