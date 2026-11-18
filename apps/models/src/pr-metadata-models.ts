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

/**
 * Model used when a PR metadata request does not name one.
 * gpt-oss-120b classified a mixed 35 KB github-schema diff correctly as feat in a dry run.
 * granite-4.0-h-micro returned a generic chore title for the same diff.
 */
export const DEFAULT_PR_METADATA_MODEL: PrMetadataModel = "@cf/openai/gpt-oss-120b";

/**
 * Output token limit for every PR metadata generation call.
 * Without it, Workers AI applies a small model default. Reasoning models then spend the whole
 * budget on reasoning and return empty text. The body is capped at 6,000 characters, so this
 * leaves room for reasoning plus the JSON answer.
 */
export const PR_METADATA_MAX_OUTPUT_TOKENS = 4_096;

/**
 * Workers AI provider options for a PR metadata model.
 * gpt-oss reasons before answering. Low effort keeps reasoning within the output token limit.
 * Other models get no reasoning options, because they may reject `reasoning_effort`.
 */
export function prMetadataProviderOptions(model: PrMetadataModel) {
  if (model === "@cf/openai/gpt-oss-120b") {
    return { "workers-ai": { reasoning_effort: "low" } };
  }

  return undefined;
}
