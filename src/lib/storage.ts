import "server-only";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { AppError } from "./errors";
export function storageConfigured() {
  return (
    process.env.STORAGE_DRIVER === "local" ||
    Boolean(
      process.env.STORAGE_BUCKET &&
      process.env.STORAGE_ACCESS_KEY_ID &&
      process.env.STORAGE_SECRET_ACCESS_KEY,
    )
  );
}
function assertConfigured() {
  if (!storageConfigured())
    throw new AppError(
      503,
      "Private file storage is not configured. Your complaint can still be submitted; evidence can be added when storage is available.",
    );
}
function client() {
  return new S3Client({
    region: process.env.STORAGE_REGION || "auto",
    endpoint: process.env.STORAGE_ENDPOINT || undefined,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
    },
  });
}
function localPath(key: string) {
  if (!/^complaints\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(key))
    throw new AppError(400, "Invalid storage key.");
  const base = resolve(process.env.PRIVATE_UPLOAD_DIR || ".private-uploads");
  if (base === resolve("public") || base.startsWith(resolve("public") + sep))
    throw new AppError(
      503,
      "Private uploads must be stored outside the public directory.",
    );
  return resolve(base, key);
}
export async function putPrivateFile(
  key: string,
  bytes: Uint8Array,
  mime: string,
) {
  assertConfigured();
  if (process.env.STORAGE_DRIVER === "local") {
    const p = localPath(key);
    await mkdir(resolve(p, ".."), { recursive: true, mode: 0o700 });
    await writeFile(p, bytes, { mode: 0o600, flag: "wx" });
    return;
  }
  await client().send(
    new PutObjectCommand({
      Bucket: process.env.STORAGE_BUCKET,
      Key: key,
      Body: bytes,
      ContentType: mime,
      ContentDisposition: "attachment",
      CacheControl: "private, no-store",
    }),
  );
}
export async function getPrivateFile(key: string) {
  assertConfigured();
  if (process.env.STORAGE_DRIVER === "local")
    return new Uint8Array(await readFile(localPath(key)));
  const object = await client().send(
    new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }),
  );
  if (!object.Body) throw new AppError(404, "Evidence file is unavailable.");
  return object.Body.transformToByteArray();
}
export async function removePrivateFile(key: string) {
  if (process.env.STORAGE_DRIVER === "local") return unlink(localPath(key));
  await client().send(
    new DeleteObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }),
  );
}
