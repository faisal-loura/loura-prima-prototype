import "server-only";

/**
 * Wakes the worker after an operation queues work. The worker also polls on an
 * interval (see instrumentation.ts), so a missed kick only delays execution.
 */
const g = globalThis as unknown as { __louraKick?: () => void };

export function registerKick(fn: () => void) {
  g.__louraKick = fn;
}

export function kick() {
  g.__louraKick?.();
}
