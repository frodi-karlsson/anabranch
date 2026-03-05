import type { RequestOptions, WebClientOptions } from "@anabranch/web-client";

export interface CheckResult {
  url: URL;
  parent: URL | undefined;
  ok: boolean;
  status: number | undefined;
  reason: string | undefined;
  isPath: boolean;
  durationMs: number;
}

export type RetryOptions = RequestOptions["retry"];

export interface BrokenLinkCheckerOptions {
  concurrency?: number;
  timeout?: number;
  retry?: RetryOptions;
  fetch?: WebClientOptions["fetch"];
  userAgent?: string;
}