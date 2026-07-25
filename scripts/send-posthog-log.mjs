import { readFileSync } from 'node:fs';
import { SeverityNumber } from '@opentelemetry/api-logs';

function loadLocalEnv() {
  try {
    const envPath = new URL('../.env', import.meta.url);
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/u);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex === -1) continue;

      const key = trimmed.slice(0, equalsIndex).trim();
      const value = trimmed.slice(equalsIndex + 1).trim();
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // The script also works in CI or production when env vars are provided directly.
  }
}

loadLocalEnv();

const { logger, flushAndShutdownPostHogLogger } = await import('./posthog-node-logger.mjs');
const body =
  process.argv
    .slice(2)
    .filter((argument) => argument !== '--')
    .join(' ') || 'Node.js PostHog OpenTelemetry log test';
const now = new Date().toISOString();

logger.emit({
  severityNumber: SeverityNumber.INFO,
  severityText: 'INFO',
  body,
  attributes: {
    'app.name': 'linear-algebra-lab',
    'deployment.environment': process.env.NODE_ENV || 'local',
    'posthog.integration': 'node-otel',
    'server.env': process.env.NODE_ENV || 'local',
    'test.sent_at': now,
  },
});

await flushAndShutdownPostHogLogger();

console.log(`Sent PostHog log: ${body}`);
