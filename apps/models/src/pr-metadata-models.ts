/**
 * Workers AI models that a PR metadata request may name in its `model` field.
 * Requests that name any other model are rejected with 400 before the AI binding is called.
 * Before relying on a new entry, run a workflow dry run with it: the model must return
 * JSON metadata through `workers-ai-provider`, either as structured output or plain JSON.
 */
export const PR_METADATA_MODELS = [
  "@cf/ibm-granite/granite-4.0-h-micro",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/qwen/qwen3-30b-a3b-fp8",
  "@cf/openai/gpt-oss-120b",
] as const satisfies readonly (keyof AiModels)[];

/** A Workers AI model ID from the PR metadata allowlist. */
export type PrMetadataModel = (typeof PR_METADATA_MODELS)[number];

/** Model used when a PR metadata request does not name one. */
export const DEFAULT_PR_METADATA_MODEL: PrMetadataModel = "@cf/ibm-granite/granite-4.0-h-micro";
