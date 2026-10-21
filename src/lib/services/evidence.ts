import "server-only";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb, one, query } from "../db";
import { AppError } from "../errors";
import { requireParticipant, type Viewer } from "../permissions";
import { rateLimit } from "../security";
import { validateEvidence, MAX_FILE_BYTES } from "../file-validation";
import { putPrivateFile, getPrivateFile, removePrivateFile } from "../storage";
export async function uploadEvidence(
  u: Viewer,
  complaintId: string,
  file: File,
) {
  await requireParticipant(u, complaintId);
  if (file.size > MAX_FILE_BYTES)
    throw new AppError(400, "Evidence must be no larger than 10 MB.");
  await rateLimit(`upload:${u.id}`, 40, 3600);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = validateEvidence(bytes, file.type, file.name),
    key = `complaints/${complaintId}/${randomUUID()}`;
  await putPrivateFile(key, bytes, file.type);
  try {
    return await getDb().transaction(async (tx) => {
      await query(
        sql`SELECT id FROM company_feedback.complaints WHERE id=${complaintId} FOR UPDATE`,
        tx,
      );
      await requireParticipant(u, complaintId, tx);
      const count = await one<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM company_feedback.complaint_attachments WHERE complaint_id=${complaintId}`,
        tx,
      );
      if ((count?.count || 0) >= 20)
        throw new AppError(
          409,
          "This complaint already has the maximum of 20 evidence files.",
        );
      await query(
        sql`INSERT INTO company_feedback.complaint_attachments(complaint_id,uploaded_by,original_filename,storage_key,mime_type,size_bytes) VALUES (${complaintId},${u.id},${name},${key},${file.type},${bytes.length})`,
        tx,
      );
      return { message: "Evidence uploaded privately." };
    });
  } catch (error) {
    await removePrivateFile(key).catch(() =>
      console.error(
        "An orphaned private evidence object requires cleanup; key withheld.",
      ),
    );
    throw error;
  }
}
export async function downloadEvidence(
  u: Viewer,
  complaintId: string,
  id: string,
) {
  await requireParticipant(u, complaintId);
  const attachment = await one<{
    storage_key: string;
    original_filename: string;
    mime_type: string;
  }>(
    sql`SELECT storage_key,original_filename,mime_type FROM company_feedback.complaint_attachments WHERE id=${id} AND complaint_id=${complaintId}`,
  );
  if (!attachment) throw new AppError(404, "Evidence not found.");
  const bytes = await getPrivateFile(attachment.storage_key);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": attachment.mime_type,
      "Content-Disposition": `attachment; filename="evidence"; filename*=UTF-8''${encodeURIComponent(attachment.original_filename).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16))}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
