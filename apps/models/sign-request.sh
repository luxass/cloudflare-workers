#!/bin/sh

set -eu

usage() {
  cat <<'EOF'
Usage: ./sign-request.sh [options]

Options:
  --repo <value>      Optional repository name. Defaults to luxass/github-schema
  --context <value>   Optional extra context for the model
  --diff <value>      Optional diff content. Defaults to the github-schema repo diff
  --model <value>     Optional model override
  --url <value>       Endpoint URL. Defaults to http://127.0.0.1:8787/api/pr-metadata
  --secret <value>    HMAC secret. Defaults to $HMAC_SECRET
  --print-only        Print the signed curl command instead of executing it
  --help              Show this help

Environment:
  HMAC_SECRET         Default HMAC secret if --secret is not passed
  PR_METADATA_URL     Default URL if --url is not passed
EOF
}

github_schema_dir="/Users/lucasnorgard/dev/github-schema"

repo="luxass/github-schema"
context="This repository contains GitHub's GraphQL schema and generated TypeScript types.
Prefer a GraphQL type or input name as the scope when there is a clear single target."
diff_content=""
model=""
url="${PR_METADATA_URL:-http://127.0.0.1:8787/api/pr-metadata}"
secret="${HMAC_SECRET:-}"
print_only="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      repo="${2-}"
      shift 2
      ;;
    --context)
      context="${2-}"
      shift 2
      ;;
    --diff)
      diff_content="${2-}"
      shift 2
      ;;
    --model)
      model="${2-}"
      shift 2
      ;;
    --url)
      url="${2-}"
      shift 2
      ;;
    --secret)
      secret="${2-}"
      shift 2
      ;;
    --print-only)
      print_only="true"
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$secret" ]; then
  echo "Missing HMAC secret. Pass --secret or set HMAC_SECRET." >&2
  exit 1
fi

if [ -z "$diff_content" ]; then
  if [ -f "$github_schema_dir/github-schema.diff" ]; then
    diff_content="$(cat "$github_schema_dir/github-schema.diff")"
  else
    diff_content="$(git -C "$github_schema_dir" diff)"
  fi
fi

if [ -z "$diff_content" ]; then
  echo "No diff content found. Pass --diff or run from a git repo with changes." >&2
  exit 1
fi

request_json="$(
  jq -n \
    --arg repo "$repo" \
    --arg context "$context" \
    --arg diff "$diff_content" \
    --arg model "$model" \
    '{
      repository: $repo,
      context: $context,
      diff: $diff,
      model: $model
    }
    | with_entries(select(.value != ""))'
)"

timestamp="$(( $(date +%s) * 1000 ))"

signature="$(printf '%s' "${timestamp}.${request_json}" | openssl dgst -sha256 -hmac "$secret" -hex | awk '{print $2}')"

if [ "$print_only" = "true" ]; then
  cat <<EOF
curl -fsS -X POST "$url" \
  -H "content-type: application/json" \
  -H "x-timestamp: $timestamp" \
  -H "x-signature: $signature" \
  --data-binary @- <<'JSON'
$request_json
JSON
EOF
  exit 0
fi

printf '%s' "$request_json" | curl -fsS -X POST "$url" \
  -H "content-type: application/json" \
  -H "x-timestamp: $timestamp" \
  -H "x-signature: $signature" \
  --data-binary @-
