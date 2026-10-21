import { NextRequest, NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import {
  requireUser,
  requireAdmin,
  requireParticipant,
} from "@/lib/permissions";
import { readBoundedBody } from "@/lib/http";
import { AppError, publicError } from "@/lib/errors";
import { assertOrigin, constantEqual } from "@/lib/security";
import { uuid, loginInput } from "@/lib/validation";
import * as accounts from "@/lib/services/accounts";
import * as catalog from "@/lib/services/catalog";
import * as reviews from "@/lib/services/reviews";
import * as complaints from "@/lib/services/complaints";
import * as admin from "@/lib/services/admin";
import { uploadEvidence, downloadEvidence } from "@/lib/services/evidence";
import { maintenance } from "@/lib/services/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ path: string[] }> };
const ok = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function dispatch(request: NextRequest, context: Context) {
  try {
    const { path } = await context.params,
      method = request.method,
      [resource, rawId, action, child] = path;
    const search = request.nextUrl.searchParams;
    if (resource === "jobs" && rawId === "maintenance" && path.length === 2) {
      if (!["GET", "POST"].includes(method))
        throw new AppError(405, "Method not allowed.");
      const expected = process.env.CRON_SECRET;
      if (!expected || expected.length < 32)
        throw new AppError(503, "Scheduling authentication is not configured.");
      if (
        !constantEqual(
          request.headers.get("authorization") || "",
          `Bearer ${expected}`,
        )
      )
        throw new AppError(401, "Unauthorized scheduler.");
      return ok(await maintenance());
    }
    if (!["GET", "HEAD"].includes(method)) assertOrigin(request);
    const body = async () => {
      const bytes = await readBoundedBody(request, 1024 * 1024);
      try {
        return JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new AppError(400, "A valid JSON request body is required.");
      }
    };
    if (resource === "auth" && path.length === 2 && method === "POST") {
      if (rawId === "register")
        return ok(await accounts.register(await body()), 201);
      if (rawId === "login") {
        const input = loginInput.parse(await body());
        await signIn("credentials", { ...input, redirect: false });
        return ok({ message: "Signed in." });
      }
      if (rawId === "logout") {
        await signOut({ redirect: false });
        return ok({ message: "Signed out." });
      }
      if (rawId === "verify-email")
        return ok(
          await accounts.verifyEmail(await requireUser(), await body()),
        );
      if (rawId === "resend-verification")
        return ok(await accounts.resendVerification(await requireUser()));
    }
    if (resource === "me" && path.length === 1) {
      if (method === "GET") return ok(await requireUser());
      if (method === "PATCH")
        return ok(
          await accounts.updateProfile(await requireUser(), await body()),
        );
    }
    if (resource === "organizations") {
      if (!rawId && method === "GET")
        return ok(
          await catalog.directory({
            q: search.get("q") || "",
            sector: search.get("sector") || "",
            type: search.get("type") || "",
            page: z.coerce
              .number()
              .int()
              .min(1)
              .max(10000)
              .catch(1)
              .parse(search.get("page") || 1),
          }),
        );
      const id = uuid.parse(rawId);
      if (path.length === 2 && method === "GET") {
        const item = await catalog.getOrganization(id);
        if (!item) throw new AppError(404, "Organization not found.");
        return ok(item);
      }
      if (path.length === 2 && method === "PATCH")
        return ok(
          await catalog.updateOrganization(
            await requireUser(),
            id,
            await body(),
          ),
        );
      if (path.length === 3 && action === "services") {
        if (method === "GET") return ok(await catalog.organizationServices(id));
        if (method === "POST")
          return ok(
            await catalog.createService(await requireUser(), id, await body()),
            201,
          );
      }
    }
    if (resource === "services") {
      const id = uuid.parse(rawId);
      if (path.length === 2 && method === "GET") {
        const item = await catalog.getService(id);
        if (!item) throw new AppError(404, "Service not found.");
        return ok(item);
      }
      if (path.length === 2 && method === "PATCH")
        return ok(
          await catalog.updateService(await requireUser(), id, await body()),
        );
      if (path.length === 3 && action === "reviews") {
        if (method === "GET")
          return ok(
            await reviews.publicServiceReviews(
              id,
              z.coerce
                .number()
                .int()
                .min(1)
                .max(10000)
                .catch(1)
                .parse(search.get("page") || 1),
              search.get("sort") || "recent",
              z.coerce
                .number()
                .int()
                .min(1)
                .max(5)
                .optional()
                .catch(undefined)
                .parse(search.get("stars") || undefined),
            ),
          );
        if (method === "POST")
          return ok(
            await reviews.createReview(
              await requireUser(true),
              id,
              await body(),
            ),
            201,
          );
      }
      if (path.length === 3 && action === "complaints" && method === "POST")
        return ok(
          await complaints.createComplaint(
            await requireUser(true),
            id,
            await body(),
          ),
          201,
        );
    }
    if (resource === "reviews") {
      const id = uuid.parse(rawId);
      if (path.length === 2 && method === "PATCH")
        return ok(
          await reviews.editReview(await requireUser(true), id, await body()),
        );
      if (path.length === 2 && method === "DELETE")
        return ok(await reviews.deleteReview(await requireUser(), id));
      if (path.length === 3 && action === "replies" && method === "POST")
        return ok(
          await reviews.replyToReview(await requireUser(), id, await body()),
          201,
        );
      if (path.length === 3 && action === "report" && method === "POST")
        return ok(
          await reviews.reportContent(
            await requireUser(true),
            id,
            "review",
            await body(),
          ),
          201,
        );
    }
    if (
      resource === "review-replies" &&
      path.length === 3 &&
      action === "report" &&
      method === "POST"
    )
      return ok(
        await reviews.reportContent(
          await requireUser(true),
          uuid.parse(rawId),
          "reply",
          await body(),
        ),
        201,
      );
    if (resource === "complaints") {
      const user = await requireUser();
      if (!rawId && method === "GET")
        return ok(
          await complaints.listComplaints(
            user,
            search.get("scope") || "all",
            search.get("filter") || "all",
            z.coerce
              .number()
              .int()
              .min(1)
              .max(10000)
              .catch(1)
              .parse(search.get("page") || 1),
          ),
        );
      const id = uuid.parse(rawId);
      if (path.length === 2 && method === "GET")
        return ok(await complaints.complaintDetail(user, id));
      if (path.length === 3 && action === "messages" && method === "POST")
        return ok(await complaints.addMessage(user, id, await body()), 201);
      if (
        path.length === 3 &&
        action === "resolution-proposals" &&
        method === "POST"
      )
        return ok(
          await complaints.proposeResolution(user, id, await body()),
          201,
        );
      if (action === "attachments") {
        if (path.length === 4 && method === "GET")
          return await downloadEvidence(user, id, uuid.parse(child));
        if (path.length === 3 && method === "POST") {
          await requireParticipant(user, id);
          if (
            Number(request.headers.get("content-length") || 0) >
            11 * 1024 * 1024
          )
            throw new AppError(413, "Evidence must be no larger than 10 MB.");
          const bytes = await readBoundedBody(request, 11 * 1024 * 1024);
          let form: FormData;
          try {
            form = await new Response(new Uint8Array(bytes), {
              headers: {
                "Content-Type": request.headers.get("content-type") || "",
              },
            }).formData();
          } catch {
            throw new AppError(
              400,
              "A valid multipart evidence upload is required.",
            );
          }
          const file = form.get("file");
          if (!(file instanceof File))
            throw new AppError(400, "Choose an evidence file.");
          return ok(await uploadEvidence(user, id, file), 201);
        }
      }
    }
    if (
      resource === "resolution-proposals" &&
      path.length === 3 &&
      action === "confirm" &&
      method === "POST"
    )
      return ok(
        await complaints.confirmResolution(
          await requireUser(true),
          uuid.parse(rawId),
        ),
      );
    if (resource === "admin") {
      const user = await requireUser();
      requireAdmin(user);
      if (path.length === 1 && method === "GET")
        return ok(await admin.adminOverview(user));
      if (path.length === 2 && method === "POST") {
        if (rawId === "organizations")
          return ok(await admin.createOrganization(user, await body()), 201);
        if (rawId === "staff-accounts")
          return ok(await admin.createStaff(user, await body()), 201);
        if (rawId === "memberships")
          return ok(await admin.createMembership(user, await body()), 201);
        if (rawId === "assessor-assignments")
          return ok(await admin.assignAuthority(user, await body()), 201);
      }
      if (path.length === 3 && method === "PATCH") {
        const id = uuid.parse(action);
        if (rawId === "organizations")
          return ok(
            await admin.adminUpdateOrganization(user, id, await body()),
          );
        if (rawId === "memberships")
          return ok(await admin.setMembershipAccess(user, id, await body()));
        if (rawId === "users")
          return ok(await admin.setUserAccess(user, id, await body()));
        if (rawId === "assessor-assignments")
          return ok(await admin.endAssignment(user, id));
        if (rawId === "reports")
          return ok(await admin.moderateReport(user, id, await body()));
      }
    }
    throw new AppError(404, "Endpoint not found.");
  } catch (error) {
    if (error instanceof ZodError)
      return ok(
        {
          error: "Please check the highlighted fields.",
          fields: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        400,
      );
    if (error instanceof AuthError)
      return ok(
        {
          error:
            "Sign-in failed. Check your email and password, wait if you have tried repeatedly, and try again.",
        },
        401,
      );
    const result = publicError(error);
    return ok({ error: result.message }, result.status);
  }
}
export const GET = dispatch,
  POST = dispatch,
  PATCH = dispatch,
  DELETE = dispatch;
