export interface RequestLogger {
  set(context: Record<string, unknown>): void;
  error(error: Error, context?: Record<string, unknown>): void;
  emit(): void;
}

const requestLoggers = new WeakMap<Request, RequestLogger>();

export function setRequestLogger(request: Request, logger: RequestLogger): RequestLogger {
  requestLoggers.set(request, logger);
  return logger;
}

export function getRequestLogger(request: Request): RequestLogger | undefined {
  return requestLoggers.get(request);
}

export function deleteRequestLogger(request: Request): void {
  requestLoggers.delete(request);
}

export function toLogError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
