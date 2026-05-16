type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const enabled = import.meta.env.COMMAND !== 'build';

function redact(value: unknown) {
  if (typeof value !== 'object' || value === null) return value;
  return JSON.parse(
    JSON.stringify(value, (key, nestedValue) =>
      /token|secret|password|access/i.test(key) ? '[redacted]' : nestedValue
    )
  );
}

export function log(level: LogLevel, message: string, context?: unknown) {
  if (!enabled && level !== 'error') return;
  const payload = context ? redact(context) : undefined;
  console[level](`[IntentFlow Extension] ${message}`, payload ?? '');
}
