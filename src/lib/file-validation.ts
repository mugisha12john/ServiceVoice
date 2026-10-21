import { AppError } from "./errors";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_FILES = ".pdf,.png,.jpg,.jpeg,.webp";
export function validateEvidence(
  bytes: Uint8Array,
  mime: string,
  name: string,
) {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES)
    throw new AppError(400, "Choose a non-empty file up to 10 MB.");
  const starts = (expected: number[]) =>
    expected.every((v, i) => bytes[i] === v);
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  const valid =
    (mime === "application/pdf" &&
      /\.pdf$/i.test(name) &&
      ascii(0, 5) === "%PDF-") ||
    (mime === "image/png" &&
      /\.png$/i.test(name) &&
      starts([137, 80, 78, 71, 13, 10, 26, 10])) ||
    (mime === "image/jpeg" &&
      /\.jpe?g$/i.test(name) &&
      starts([255, 216, 255])) ||
    (mime === "image/webp" &&
      /\.webp$/i.test(name) &&
      ascii(0, 4) === "RIFF" &&
      ascii(8, 4) === "WEBP");
  if (!valid)
    throw new AppError(
      400,
      "Only genuine PDF, PNG, JPEG, and WebP files are accepted. The file contents, type, and extension must match.",
    );
  return name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 240);
}
