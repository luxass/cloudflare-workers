type AiModelDefinition = {
  inputs: Record<string, unknown>;
  postProcessedOutputs: unknown;
};

type AiModelList = Record<string, AiModelDefinition>;

declare abstract class Ai<TModels extends AiModelList = AiModelList> {
  run<
    TModel extends keyof TModels,
    TInput extends TModels[TModel]["inputs"],
    TOptions extends { returnRawResponse?: boolean } | undefined,
  >(
    model: TModel,
    inputs: TInput,
    options?: TOptions,
  ): Promise<
    TOptions extends { returnRawResponse: true }
      ? Response
      : TInput extends { stream: true }
        ? ReadableStream
        : TModels[TModel]["postProcessedOutputs"]
  >;

  models(params?: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
}

declare namespace Cloudflare {
  interface Env {
    ENVIRONMENT?: "preview" | "production";
    AI: Ai;
    DEFAULT_MODEL: string;
    HMAC_SECRET: string;
  }
}

interface CloudflareBindings extends Cloudflare.Env {}

interface ExecutionContext {
  props: unknown;
  passThroughOnException(): void;
  waitUntil(promise: Promise<unknown>): void;
}
