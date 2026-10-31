/**
 * OpenTelemetry: traces, logs and metrics over OTLP/HTTP to any compatible APM or collector.
 * Imported first in main.ts so instrumentations patch modules before they load.
 *
 * Off unless an OTLP endpoint is configured (and OTEL_SDK_DISABLED isn't `true`), so tests and
 * local development pay nothing. Configured only through the standard OTEL_* variables.
 */
import type { IncomingMessage } from 'node:http';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

const ENDPOINT_VARIABLES = [
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
  'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT',
  'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT',
];

export const telemetryEnabled =
  process.env.OTEL_SDK_DISABLED !== 'true' &&
  ENDPOINT_VARIABLES.some((name) => Boolean(process.env[name]));

/** Orchestrator probes would otherwise dominate the traces. */
function isHealthProbe(req: IncomingMessage): boolean {
  return req.url?.startsWith('/api/health') ?? false;
}

let sdk: NodeSDK | undefined;

if (telemetryEnabled) {
  // NestJS 12 is ESM and imports express through the ESM loader, which require-time patching
  // never sees; this loader hook lets the express instrumentation patch it too.
  register('@opentelemetry/instrumentation/hook.mjs', pathToFileURL(__filename));
  process.env.OTEL_SERVICE_NAME ??= 'auth-api';

  sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
        // A reader built by hand doesn't read the standard variable itself.
        exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL) || 60_000,
      }),
    ],
    instrumentations: [
      // Request/response headers are not recorded (the defaults), so cookies and the CSRF
      // token never become span attributes.
      new HttpInstrumentation({ ignoreIncomingRequestHook: isHealthProbe }),
      new ExpressInstrumentation(),
      new MongooseInstrumentation(),
      new IORedisInstrumentation(),
      // Adds trace_id/span_id to log lines and sends the (already redacted) records via OTLP.
      new PinoInstrumentation(),
    ],
  });
  sdk.start();
}

/** Flushes pending telemetry; called on application shutdown. */
export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}
