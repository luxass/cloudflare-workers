import { z } from "zod";

const signatureSchemas = {
  hex: z.string().regex(/^[\da-f]{64}$/i),
  sha256: z.string().regex(/^sha256=[\da-f]{64}$/i),
};

type SignatureFormat = keyof typeof signatureSchemas;

export interface VerifyHmacSignatureOptions {
  secret: string;
  payload: string;
  signature: string;
  format: SignatureFormat;
}

function encodeText(value: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(value);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function verifyHmacSignature({
  secret,
  payload,
  signature,
  format,
}: VerifyHmacSignatureOptions): Promise<boolean> {
  if (!signatureSchemas[format].safeParse(signature).success) {
    return false;
  }

  const signatureHex = format === "sha256" ? signature.slice("sha256=".length) : signature;
  const signatureBuffer = new ArrayBuffer(signatureHex.length / 2);
  const signatureBytes = new Uint8Array(signatureBuffer);
  for (let index = 0; index < signatureHex.length; index += 2) {
    signatureBytes[index / 2] = Number.parseInt(signatureHex.slice(index, index + 2), 16);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encodeText(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return crypto.subtle.verify("HMAC", key, signatureBuffer, encodeText(payload));
}
