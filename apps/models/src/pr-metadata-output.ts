import { z } from "zod";

/**
 * Shape that the model must return.
 * It is kept simple so every model receives a plain JSON schema; content rules are checked in `parsePrMetadata`.
 */
export const PR_METADATA_OUTPUT_SCHEMA = z.object({
  type: z.enum(["docs", "feat", "fix", "chore"]),
  scope: z.string(),
  message: z.string(),
  body: z.string(),
});

/** Validated PR metadata, safe to publish as a PR title and body. */
export type PrMetadata = z.infer<typeof PR_METADATA_OUTPUT_SCHEMA>;

const GENERIC_SCOPES = new Set([
  "pr",
  "pullrequest",
  "github",
  "automation",
  "schema",
  "deps",
  "dependencies",
]);
// Letters, digits, and the punctuation found in GraphQL and Linguist names, for example "C++", "F#", "Ren'Py".
// Parentheses and colons are excluded because they break the "type(scope): message" title format.
const SCOPE_PATTERN = /^[\p{L}\p{N}_][\p{L}\p{N} ._+#'/-]*$/u;
const MAX_SCOPE_LENGTH = 60;
const MAX_MESSAGE_LENGTH = 72;
const MAX_BODY_LENGTH = 6_000;

const INLINE_CODE_PATTERN = /`[^`\n]+`/g;
const CODE_FENCE_PATTERN = /```|~~~/;
// Mentions notify people, links and images can mislead reviewers, and HTML can hide text in the rendered PR.
// Inline code is exempt because GitHub renders it literally, so `@deprecated` stays plain text.
const UNSAFE_MARKUP_PATTERN = /[<>@]|https?:\/\/|www\.|!\[|\]\(|\]\[/i;
// The update workflows use this marker to block automatic releases, so the model must never produce it.
const INCOMPLETE_MARKER_PATTERN = /\[incomplete\]/i;

/** Thrown when generated PR metadata does not match the shape or content rules. */
export class PrMetadataValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`PR metadata failed validation: ${issues.join("; ")}`);
    this.name = "PrMetadataValidationError";
    this.issues = issues;
  }
}

/** Returns a normalized scope, or an empty string when the scope is generic or unusable in a PR title. */
export function normalizePrMetadataScope(scope: string): string {
  const normalized = scope.trim();

  if (!normalized || normalized.length > MAX_SCOPE_LENGTH || !SCOPE_PATTERN.test(normalized)) {
    return "";
  }

  const comparable = normalized.toLowerCase().replaceAll(/[\s_-]+/g, "");

  return GENERIC_SCOPES.has(comparable) ? "" : normalized;
}

/** Returns why generated text is unsafe to publish in a PR, or undefined when it is safe. */
function findUnsafePrMetadataText(text: string, allowLineBreaks: boolean): string | undefined {
  const withoutAllowedWhitespace = allowLineBreaks ? text.replaceAll(/[\n\t]/g, "") : text;

  if (/\p{Cc}/u.test(withoutAllowedWhitespace)) {
    return allowLineBreaks ? "control characters" : "line breaks or control characters";
  }

  if (CODE_FENCE_PATTERN.test(text)) {
    return "code fences";
  }

  if (INCOMPLETE_MARKER_PATTERN.test(text)) {
    return "the incomplete marker";
  }

  if (UNSAFE_MARKUP_PATTERN.test(text.replaceAll(INLINE_CODE_PATTERN, ""))) {
    return "links, HTML, or mentions outside inline code";
  }

  return undefined;
}

/** Validates and normalizes model output. Throws `PrMetadataValidationError` when it is unusable. */
export function parsePrMetadata(output: unknown): PrMetadata {
  const parsed = PR_METADATA_OUTPUT_SCHEMA.safeParse(output);

  if (!parsed.success) {
    throw new PrMetadataValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`),
    );
  }

  const metadata: PrMetadata = {
    type: parsed.data.type,
    scope: normalizePrMetadataScope(parsed.data.scope),
    message: parsed.data.message.trim(),
    body: parsed.data.body.trim(),
  };
  const issues: string[] = [];

  if (!metadata.message) {
    issues.push("message: is empty");
  } else if (metadata.message.length > MAX_MESSAGE_LENGTH) {
    issues.push(`message: is longer than ${MAX_MESSAGE_LENGTH} characters`);
  }

  const messageProblem = findUnsafePrMetadataText(metadata.message, false);
  if (messageProblem) {
    issues.push(`message: contains ${messageProblem}`);
  }

  if (!metadata.body) {
    issues.push("body: is empty");
  } else if (metadata.body.length > MAX_BODY_LENGTH) {
    issues.push(`body: is longer than ${MAX_BODY_LENGTH} characters`);
  }

  const bodyProblem = findUnsafePrMetadataText(metadata.body, true);
  if (bodyProblem) {
    issues.push(`body: contains ${bodyProblem}`);
  }

  if (issues.length > 0) {
    throw new PrMetadataValidationError(issues);
  }

  return metadata;
}
