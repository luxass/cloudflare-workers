import {
  Octokit,
} from "@octokit/core";
import {
  paginateRest,
} from "@octokit/plugin-paginate-rest";
import type { $$Octokit, Repository } from "./types";

export function base64ToRawText(base64: string) {
  const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  const paddingChar = "=";
  let output = "";
  let buffer = 0;
  let bufferLength = 0;

  for (let i = 0; i < base64.length; i++) {
    const char = base64.charAt(i);
    const charIndex = base64Chars.indexOf(char);

    if (char === paddingChar) {
      break; // Padding character, stop decoding
    }

    if (charIndex === -1) {
      continue; // Skip invalid characters
    }

    buffer = (buffer << 6) | charIndex;
    bufferLength += 6;

    if (bufferLength >= 8) {
      bufferLength -= 8;
      const charCode = (buffer >> bufferLength) & 0xFF;
      output += String.fromCharCode(charCode);
    }
  }

  return output;
}

export const $Octokit = Octokit.plugin(paginateRest);

export function translate<T>(originalObject: T, translationValues: any): T {
  if (typeof originalObject !== "object") {
    return originalObject;
  }

  const translatedObject: any = {};

  for (const key in originalObject) {
    const value = originalObject[key];

    if (typeof value === "string") {
      const matches = value.match(/%([^%]+)%/);

      if (matches) {
        const placeholder = matches[1];
        const translation = translationValues[placeholder];

        if (translation) {
          translatedObject[key] = value.replace(`%${placeholder}%`, translation);
        } else {
          translatedObject[key] = value;
        }
      } else {
        translatedObject[key] = value;
      }
    } else if (typeof value === "object") {
      translatedObject[key] = translate(value, translationValues);
    } else {
      translatedObject[key] = value;
    }
  }

  return translatedObject;
}

export const BUILTIN_QUERY = `#graphql
  query getBuiltin($path: String!) {
    repository(owner: "microsoft", name: "vscode") {
      object(expression: $path) {
        ... on Tree {
          entries {
            type
            name
            path
            pathRaw
            object {
              ... on Tree {
                entries {
                  type
                  name
                  path
                  pathRaw
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function getBuiltinExtensionFiles(
  octokit: $$Octokit,
  path: string,
) {
  const {
    repository: { object: files },
  } = await octokit.graphql<{
    repository: Repository;
  }>(BUILTIN_QUERY, {
    path: `HEAD:${path}`,
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!files) {
    return null;
  }

  if (!("entries" in files)) {
    return null;
  }

  return files;
}
