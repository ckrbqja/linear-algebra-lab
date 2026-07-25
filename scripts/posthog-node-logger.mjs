import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';

const DEFAULT_POSTHOG_PROJECT_TOKEN = 'phc_nBsQic7yqDVd6WPvzufiooRz3iYjGvM9vkFvPdQmV2Ny';
const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';
const DEFAULT_SERVICE_NAME = 'linear-algebra-lab';

const posthogProjectToken =
  process.env.POSTHOG_PROJECT_TOKEN ||
  process.env.VITE_POSTHOG_PROJECT_TOKEN ||
  DEFAULT_POSTHOG_PROJECT_TOKEN;

const posthogHost = process.env.POSTHOG_HOST || process.env.VITE_POSTHOG_HOST || DEFAULT_POSTHOG_HOST;
const posthogOtlpLogsUrl = `${posthogHost.replace(/\/$/, '')}/otlp/v1/logs`;
const serviceName = process.env.OTEL_SERVICE_NAME || process.env.POSTHOG_SERVICE_NAME || DEFAULT_SERVICE_NAME;

const exporter = new OTLPLogExporter({
  url: posthogOtlpLogsUrl,
  headers: {
    Authorization: `Bearer ${posthogProjectToken}`,
  },
});

export const loggerProvider = new LoggerProvider({
  resource: resourceFromAttributes({
    'service.name': serviceName,
  }),
  processors: [new SimpleLogRecordProcessor(exporter)],
});

export const logger = loggerProvider.getLogger(serviceName);

export async function flushAndShutdownPostHogLogger() {
  await loggerProvider.forceFlush();
  await loggerProvider.shutdown();
}
