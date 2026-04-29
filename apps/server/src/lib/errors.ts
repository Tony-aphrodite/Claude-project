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
  constructor(reason: string) {
    super("webhook_signature_invalid", `Invalid signature: ${reason}`, 401);
    this.name = "WebhookSignatureError";
  }
}

export class SedeNotFoundError extends AppError {
  constructor(tag: string) {
    super("sede_not_found", `No sede mapped to tag "${tag}"`, 404, { tag });
    this.name = "SedeNotFoundError";
  }
}

export class UpstreamError extends AppError {
  constructor(source: string, message: string, context?: Record<string, unknown>) {
    super(`upstream_${source}`, message, 502, context);
    this.name = "UpstreamError";
  }
}

export class CostLimitError extends AppError {
  constructor(limitUsd: number, spentUsd: number) {
    super(
      "cost_limit_reached",
      `Daily Anthropic spend ${spentUsd.toFixed(2)} USD reached the limit ${limitUsd.toFixed(2)} USD`,
      503,
      { limitUsd, spentUsd },
    );
    this.name = "CostLimitError";
  }
}
