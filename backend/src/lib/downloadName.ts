import { createHash } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/**
 * A 10-character alphanumeric code derived from `seed`, so the same document
 * always downloads under the same name.
 */
export function stableCode(seed: string, length = 10): string {
  const digest = createHash("sha256").update(seed).digest();
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[digest[i]! % CODE_ALPHABET.length];
  return code;
}

/** e.g. "Kezia-Sia-Sam-ID-Card-7K3P9QX2MA.png": the participant's name, the document, and a stable code. */
export function participantFileName(
  name: string | null,
  seed: string,
  extension = "pdf",
  documentLabel?: string,
): string {
  const clean = (value: string) =>
    value.trim().replace(/[\\/:*?"<>|\s]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const base = clean(name ?? "Participant") || "Participant";
  const label = documentLabel ? `-${clean(documentLabel)}` : "";
  return `${base}${label}-${stableCode(seed)}.${extension}`;
}

/**
 * Content-Disposition for an arbitrary (possibly non-ASCII) file name: an ASCII
 * `filename` fallback plus the exact name as RFC 5987 `filename*`.
 */
export function attachmentDisposition(fileName: string): string {
  const ascii = fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
