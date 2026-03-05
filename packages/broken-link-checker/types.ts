export interface CheckResult {
  url: URL;
  parent: URL | undefined;
  ok: boolean;
  status: number | undefined;
  reason: string | undefined;
  isPath: boolean;
  durationMs: number;
}

export interface RetryOptions {
  attempts?: number;
  delay?: (attempt: number) => number;
  when?: (error: Error) => boolean;
}

export interface BrokenLinkCheckerOptions {
  concurrency?: number;
  timeout?: number;
  retry?: RetryOptions;
  fetch?: typeof globalThis.fetch;
  userAgent?: string;
}
