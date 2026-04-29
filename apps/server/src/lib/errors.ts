// Tagged error classes that the route layer can map to HTTP status codes.
// Distinct types avoid string-matching error.message at the boundary.

export class AppError extends Error {
  override readonly name: string = "AppError";
  readonly statusCode: number;
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    statusCode = 500,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
  }
}

export class WebhookSignatureError extends AppError {
  override readonly name = "WebhookSignatureError";
  constructor(reason: string) {
    super("webhook_signature_invalid", `Invalid signature: ${reason}`, 401);
  }
}

export class SedeNotFoundError extends AppError {
  override readonly name = "SedeNotFoundError";
  constructor(tag: string) {
    super("sede_not_found", `No sede mapped to tag "${tag}"`, 404, { tag });
  }
}

export class UpstreamError extends AppError {
  override readonly name = "UpstreamError";
  constructor(source: string, message: string, context?: Record<string, unknown>) {
    super(`upstream_${source}`, message, 502, context);
  }
}

export class CostLimitError extends AppError {
  override readonly name = "CostLimitError";
  constructor(limitUsd: number, spentUsd: number) {
    super(
      "cost_limit_reached",
      `Daily Anthropic spend ${spentUsd.toFixed(2)} USD reached the limit ${limitUsd.toFixed(2)} USD`,
      503,
      { limitUsd, spentUsd },
    );
  }
}
