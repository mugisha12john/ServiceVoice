/** Isolated system checks. Never connects to DATABASE_URL or Neon. */
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { compare, hash } from "bcryptjs";
import { SMTPServer } from "smtp-server";
import { chromium, request, type APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  AdminBootstrapError,
  createFirstAdministrator,
} from "./lib/admin-bootstrap";

const PG_BIN = process.env.PG_TEST_BIN || "/usr/lib/postgresql/18/bin";
const PORT = Number(process.env.SYSTEM_TEST_PORT || 3107),
  PG_PORT = Number(process.env.PG_TEST_PORT || 55439),
  SMTP_PORT = Number(process.env.SMTP_TEST_PORT || 10289);
const base = `http://127.0.0.1:${PORT}`,
  testPassword = "Fictional-test-passphrase-2026",
  cronSecret = randomBytes(32).toString("hex");
const messages: string[] = [];
let rejectTestMail = false;
let passed = 0,
  server: ChildProcess | undefined,
  client: Client | undefined,
  startedPg = false,
  root = "";
const contexts: APIRequestContext[] = [];
const smtp = new SMTPServer({
  authOptional: false,
  disabledCommands: ["STARTTLS"],
  logger: false,
  onAuth(auth, _session, callback) {
    callback(
      auth.username === "test" && auth.password === "test"
        ? null
        : new Error("Test credentials required"),
      { user: "test" },
    );
  },
  onData(stream, _session, callback) {
    let data = "";
    stream.on("data", (chunk) => {
      data += chunk.toString();
    });
    stream.on("end", () => {
      if (rejectTestMail) {
        callback(new Error("Intentional isolated SMTP failure"));
        return;
      }
      messages.push(data);
      callback();
    });
  },
});
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
async function context() {
  const c = await request.newContext({
    baseURL: base,
    extraHTTPHeaders: { Origin: base },
  });
  contexts.push(c);
  return c;
}
async function api(
  ctx: APIRequestContext,
  path: string,
  method = "GET",
  body?: unknown,
  status = 200,
) {
  const r = await ctx.fetch(`/api/v1${path}`, { method, data: body });
  assert.equal(
    r.status(),
    status,
    `${method} ${path}: expected ${status}, got ${r.status()}; ${r.status() !== status ? await r.text() : ""}`,
  );
  return r.json();
}
async function fixtureUser(name: string, admin = false) {
  const result = await client!.query(
    "INSERT INTO company_feedback.users(username,email,password_hash,email_verified_at,is_super_admin) VALUES($1,$2,$3,now(),$4) RETURNING id",
    [name, `${name}@example.test`, await hash(testPassword, 12), admin],
  );
  return result.rows[0].id as string;
}
async function login(name: string) {
  const c = await context();
  await api(c, "/auth/login", "POST", {
    email: `${name}@example.test`,
    password: testPassword,
  });
  return c;
}
async function waitReady() {
  for (let i = 0; i < 100; i++) {
    if (server?.exitCode !== null)
      throw new Error("Test application stopped unexpectedly");
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Test application did not become ready");
}
async function main() {
  root = await mkdtemp(join(tmpdir(), "servicevoice-check-"));
  const cluster = join(root, "postgres");
  const init = spawnSync(
    join(PG_BIN, "initdb"),
    ["-D", cluster, "-A", "trust", "--no-locale", "-E", "UTF8"],
    { encoding: "utf8" },
  );
  assert.equal(
    init.status,
    0,
    "Temporary PostgreSQL initialization failed. Install PostgreSQL server tools or set PG_TEST_BIN.",
  );
  const start = spawnSync(
    join(PG_BIN, "pg_ctl"),
    [
      "-D",
      cluster,
      "-l",
      join(root, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p ${PG_PORT} -k ${root}`,
      "-w",
      "start",
    ],
    { encoding: "utf8" },
  );
  assert.equal(start.status, 0, "Temporary PostgreSQL could not start");
  startedPg = true;
  const databaseURL = `postgresql://127.0.0.1:${PG_PORT}/postgres`;
  client = new Client({ connectionString: databaseURL });
  await client.connect();
  await client.query(await readFile("database/reference-schema.sql", "utf8"));
  await client.query(
    await readFile("migrations/001_application_support.sql", "utf8"),
  );
  console.log(
    "Testing against a temporary local PostgreSQL cluster. Neon and .env.local are not used by this test.",
  );
  const bootstrapConsumerId = await fixtureUser("fictional_bootstrap_consumer");
  await check(
    "Bootstrap refuses to promote or overwrite an existing consumer",
    async () => {
      await assert.rejects(
        createFirstAdministrator(client!, {
          username: "Fictional bootstrap operator",
          email: "fictional_bootstrap_consumer@example.test",
          password: "Different-fictional-password",
        }),
        (error: unknown) =>
          !!error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23505",
      );
      const existing = await client!.query(
        "SELECT is_super_admin,password_hash FROM company_feedback.users WHERE id=$1",
        [bootstrapConsumerId],
      );
      assert.equal(existing.rows[0].is_super_admin, false);
      assert.equal(
        await compare(testPassword, existing.rows[0].password_hash),
        true,
      );
    },
  );
  await check(
    "First administrator is hashed and still requires email verification",
    async () => {
      await createFirstAdministrator(client!, {
        username: " Fictional first admin ",
        email: "FIRST_ADMIN@example.test",
        password: testPassword,
      });
      const result = await client!.query(
        "SELECT username,password_hash,is_super_admin,email_verified_at FROM company_feedback.users WHERE email=$1",
        ["first_admin@example.test"],
      );
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].username, "Fictional first admin");
      assert.equal(result.rows[0].is_super_admin, true);
      assert.equal(result.rows[0].email_verified_at, null);
      assert.notEqual(result.rows[0].password_hash, testPassword);
      assert.equal(
        await compare(testPassword, result.rows[0].password_hash),
        true,
      );
    },
  );
  await check(
    "Bootstrap refuses another administrator even if the existing one is disabled",
    async () => {
      await client!.query(
        "UPDATE company_feedback.users SET is_active=false WHERE is_super_admin",
      );
      await assert.rejects(
        createFirstAdministrator(client!, {
          username: "Fictional second admin",
          email: "second_admin@example.test",
          password: testPassword,
        }),
        AdminBootstrapError,
      );
      const result = await client!.query(
        "SELECT count(*)::int AS count FROM company_feedback.users WHERE is_super_admin",
      );
      assert.equal(result.rows[0].count, 1);
    },
  );
  // Only the disposable local test cluster is cleared between bootstrap checks.
  await client.query("DELETE FROM company_feedback.users");
  await check(
    "Concurrent first-admin bootstraps create only one administrator",
    async () => {
      const contender = new Client({ connectionString: databaseURL });
      await contender.connect();
      try {
        const results = await Promise.allSettled(
          [client!, contender].map((connection, index) =>
            createFirstAdministrator(connection, {
              username: `Fictional concurrent admin ${index}`,
              email: `concurrent_admin_${index}@example.test`,
              password: testPassword,
            }),
          ),
        );
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        const rejected = results.find((r) => r.status === "rejected");
        assert.ok(
          rejected?.status === "rejected" &&
            rejected.reason instanceof AdminBootstrapError,
        );
        const result = await client!.query(
          "SELECT count(*)::int AS count FROM company_feedback.users",
        );
        assert.equal(result.rows[0].count, 1);
      } finally {
        await contender.end();
      }
    },
  );
  await client.query("DELETE FROM company_feedback.users");
  const adminId = await fixtureUser("fictional_admin", true),
    repId = await fixtureUser("fictional_rep"),
    assessorId = await fixtureUser("fictional_assessor"),
    assessor2Id = await fixtureUser("fictional_assessor_two"),
    bId = await fixtureUser("fictional_consumer_b"),
    cId = await fixtureUser("fictional_consumer_c"),
    outsiderId = await fixtureUser("fictional_outsider");
  const orgId = (
    await client.query(
      "INSERT INTO company_feedback.organizations(name,sector,organization_type,description,contact_email) VALUES('Fictional Kivu Services','Utilities','PRIVATE','Fictional organization used only in isolated tests.','hello@example.test') RETURNING id",
    )
  ).rows[0].id;
  const otherId = (
    await client.query(
      "INSERT INTO company_feedback.organizations(name,sector,organization_type) VALUES('Fictional Unrelated Company','Finance','PRIVATE') RETURNING id",
    )
  ).rows[0].id;
  const authorityId = (
    await client.query(
      "INSERT INTO company_feedback.organizations(name,sector,organization_type,can_assess) VALUES('Fictional Assessment Office','Oversight','GOVERNMENT',true) RETURNING id",
    )
  ).rows[0].id;
  const authority2Id = (
    await client.query(
      "INSERT INTO company_feedback.organizations(name,sector,organization_type,can_assess) VALUES('Fictional Second Authority','Oversight','GOVERNMENT',true) RETURNING id",
    )
  ).rows[0].id;
  for (const [userId, organizationId, role] of [
    [repId, orgId, "REPRESENTATIVE"],
    [assessorId, authorityId, "ASSESSOR"],
    [assessor2Id, authority2Id, "ASSESSOR"],
  ])
    await client.query(
      "INSERT INTO company_feedback.memberships(user_id,organization_id,role) VALUES($1,$2,$3)",
      [userId, organizationId, role],
    );
  const assignmentId = (
    await client.query(
      "INSERT INTO company_feedback.assessor_assignments(organization_id,authority_id,assigned_by) VALUES($1,$2,$3) RETURNING id",
      [orgId, authorityId, adminId],
    )
  ).rows[0].id;
  const serviceId = (
    await client.query(
      "INSERT INTO company_feedback.services(organization_id,name,description) VALUES($1,'Water connection support','Fictional service for installation questions and connection support.') RETURNING id",
      [orgId],
    )
  ).rows[0].id;
  const noRouteService = (
    await client.query(
      "INSERT INTO company_feedback.services(organization_id,name) VALUES($1,'Fictional unassigned service') RETURNING id",
      [otherId],
    )
  ).rows[0].id;
  await new Promise<void>((resolve) =>
    smtp.listen(SMTP_PORT, "127.0.0.1", resolve),
  );
  const testEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseURL,
    AUTH_SECRET: randomBytes(32).toString("hex"),
    AUTH_URL: base,
    APP_URL: base,
    AUTH_TRUST_HOST: "false",
    CRON_SECRET: cronSecret,
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(SMTP_PORT),
    SMTP_SECURE: "false",
    SMTP_REQUIRE_TLS: "false",
    SMTP_USER: "test",
    SMTP_PASSWORD: "test",
    EMAIL_FROM: "ServiceVoice Test <noreply@example.test>",
    STORAGE_DRIVER: "local",
    PRIVATE_UPLOAD_DIR: join(root, "private-evidence"),
    NODE_ENV: "production",
  };
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--port",
      String(PORT),
      "--hostname",
      "127.0.0.1",
    ],
    { env: testEnv, stdio: ["ignore", "ignore", "pipe"] },
  );
  // Logs are retained only locally, and never printed on an error path.
  let serverErrors = "";
  server.stderr?.on("data", (chunk) => {
    serverErrors += chunk.toString();
  });
  await waitReady();
  const consumer = await context(),
    anonymous = await context();
  let consumerId = "",
    code = "",
    firstReview = "",
    secondReview = "",
    complaintId = "",
    attachmentId = "",
    proposalId = "",
    overdueId = "";
  await check(
    "consumer signup strips administrator and membership fields",
    async () => {
      await api(
        consumer,
        "/auth/register",
        "POST",
        {
          username: "fictional_consumer_a",
          email: "fictional_consumer_a@example.test",
          password: testPassword,
          is_super_admin: true,
          isSuperAdmin: true,
          memberships: [{ role: "ASSESSOR" }],
        },
        201,
      );
      const row = (
        await client!.query(
          "SELECT id,is_super_admin,password_hash FROM company_feedback.users WHERE username='fictional_consumer_a'",
        )
      ).rows[0];
      consumerId = row.id;
      assert.equal(row.is_super_admin, false);
      assert.match(row.password_hash, /^\$2[aby]\$12\$/);
    },
  );
  await check(
    "incorrect password is rejected; valid password creates a revocable session",
    async () => {
      await api(
        consumer,
        "/auth/login",
        "POST",
        {
          email: "fictional_consumer_a@example.test",
          password: "incorrect-password",
        },
        401,
      );
      await api(consumer, "/auth/login", "POST", {
        email: "fictional_consumer_a@example.test",
        password: testPassword,
      });
      assert.equal((await api(consumer, "/me")).id, consumerId);
      assert.equal(
        Number(
          (
            await client!.query(
              "SELECT count(*) FROM company_feedback.app_sessions WHERE user_id=$1",
              [consumerId],
            )
          ).rows[0].count,
        ),
        1,
      );
    },
  );
  await check(
    "unverified consumer cannot review or submit a complaint",
    async () => {
      await api(
        consumer,
        `/services/${serviceId}/reviews`,
        "POST",
        { stars: 5, comment: "A detailed service experience." },
        403,
      );
      await api(
        consumer,
        `/services/${serviceId}/complaints`,
        "POST",
        { description: "A sufficiently detailed complaint description." },
        403,
      );
    },
  );
  await check(
    "verification is delivered through SMTP and the live code is stored only as a hash",
    async () => {
      await api(consumer, "/auth/resend-verification", "POST", {});
      code = messages.at(-1)?.match(/verification code is (\d{6})/)?.[1] || "";
      assert.match(code, /^\d{6}$/);
      const record = (
        await client!.query(
          "SELECT code_hash FROM company_feedback.email_verification_codes WHERE user_id=$1",
          [consumerId],
        )
      ).rows[0];
      assert.notEqual(record.code_hash, code);
      assert.equal(record.code_hash.length, 64);
    },
  );
  await check(
    "failed verification attempts persist; correct code is single use",
    async () => {
      await api(
        consumer,
        "/auth/verify-email",
        "POST",
        { code: code === "000000" ? "000001" : "000000" },
        400,
      );
      assert.equal(
        (
          await client!.query(
            "SELECT failed_attempts FROM company_feedback.email_verification_codes WHERE user_id=$1",
            [consumerId],
          )
        ).rows[0].failed_attempts,
        1,
      );
      await api(consumer, "/auth/verify-email", "POST", { code });
      await api(consumer, "/auth/verify-email", "POST", { code }, 400);
      assert.ok((await api(consumer, "/me")).email_verified_at);
    },
  );
  const admin = await login("fictional_admin"),
    rep = await login("fictional_rep"),
    assessor = await login("fictional_assessor"),
    assessor2 = await login("fictional_assessor_two"),
    b = await login("fictional_consumer_b"),
    c = await login("fictional_consumer_c"),
    outsider = await login("fictional_outsider");
  await check(
    "API rejects cross-origin changes, consumer administration, and unrelated service ownership",
    async () => {
      const r = await consumer.post(`${base}/api/v1/me`, {
        headers: { Origin: "https://unrelated.invalid" },
        data: { username: "changed" },
      });
      assert.equal(r.status(), 403);
      await api(consumer, "/admin", "GET", undefined, 403);
      await api(
        rep,
        `/organizations/${otherId}/services`,
        "POST",
        { name: "Unauthorized service" },
        403,
      );
      await api(
        consumer,
        `/organizations/${orgId}`,
        "PATCH",
        { name: "Unauthorized", sector: "Testing" },
        403,
      );
    },
  );
  await check(
    "representative creates services only within their organization",
    async () => {
      const s = await api(
        rep,
        `/organizations/${orgId}/services`,
        "POST",
        {
          name: "Fictional combined support",
          description:
            "Connection requests and billing support in one listing.",
          isActive: true,
        },
        201,
      );
      assert.equal(
        (await api(anonymous, `/services/${s.id}`)).organization_id,
        orgId,
      );
    },
  );
  await check(
    "latest active ratings produce the expected 2.5 average",
    async () => {
      firstReview = (
        await api(
          consumer,
          `/services/${serviceId}/reviews`,
          "POST",
          {
            stars: 5,
            comment: "First detailed service experience.",
            consumerId: outsiderId,
          },
          201,
        )
      ).id;
      secondReview = (
        await api(
          consumer,
          `/services/${serviceId}/reviews`,
          "POST",
          { stars: 3, comment: "A later detailed service experience." },
          201,
        )
      ).id;
      await api(
        b,
        `/services/${serviceId}/reviews`,
        "POST",
        { stars: 2, comment: "A second consumer’s actual test experience." },
        201,
      );
      assert.equal(
        Number((await api(anonymous, `/services/${serviceId}`)).average_rating),
        2.5,
      );
    },
  );
  await check(
    "third review is blocked and editing an older review does not make it latest",
    async () => {
      const error = await api(
        consumer,
        `/services/${serviceId}/reviews`,
        "POST",
        { stars: 4, comment: "A third review should be rejected." },
        409,
      );
      assert.match(error.error, /two reviews/);
      await api(consumer, `/reviews/${firstReview}`, "PATCH", {
        stars: 1,
        comment: "Updated earlier review with more information.",
      });
      assert.equal(
        Number((await api(anonymous, `/services/${serviceId}`)).average_rating),
        2.5,
      );
      await api(
        outsider,
        `/reviews/${firstReview}`,
        "PATCH",
        { stars: 1, comment: "An unauthorized edit attempt." },
        404,
      );
    },
  );
  await check(
    "deleting the latest review falls back and frees its slot",
    async () => {
      await api(consumer, `/reviews/${secondReview}`, "DELETE", {});
      assert.equal(
        Number((await api(anonymous, `/services/${serviceId}`)).average_rating),
        1.5,
      );
      await api(
        consumer,
        `/services/${serviceId}/reviews`,
        "POST",
        { stars: 4, comment: "A replacement review after deleting one." },
        201,
      );
      assert.equal(
        Number((await api(anonymous, `/services/${serviceId}`)).average_rating),
        3,
      );
    },
  );
  await check(
    "concurrent review submissions cannot exceed the allowance",
    async () => {
      const responses = await Promise.all(
        [1, 2, 3].map((n) =>
          c.post(`/api/v1/services/${serviceId}/reviews`, {
            data: {
              stars: n,
              comment: `Concurrent fictional review number ${n}.`,
            },
          }),
        ),
      );
      assert.deepEqual(
        responses.map((r) => r.status()).sort(),
        [201, 201, 409],
      );
      assert.equal(
        Number(
          (
            await client!.query(
              "SELECT count(*) FROM company_feedback.reviews WHERE consumer_id=$1 AND service_id=$2 AND deleted_at IS NULL",
              [cId, serviceId],
            )
          ).rows[0].count,
        ),
        2,
      );
    },
  );
  await check(
    "public feedback omits email/password and permits only organization replies",
    async () => {
      await api(
        outsider,
        `/reviews/${firstReview}/replies`,
        "POST",
        { body: "Unauthorized reply" },
        403,
      );
      await api(
        rep,
        `/reviews/${firstReview}/replies`,
        "POST",
        { body: "Thank you. We have noted the connection issue." },
        201,
      );
      const reviews = await api(anonymous, `/services/${serviceId}/reviews`);
      const serialized = JSON.stringify(reviews);
      assert.ok(!serialized.includes("@example.test"));
      assert.ok(!serialized.includes("password_hash"));
      assert.ok(
        reviews.find((r: { id: string }) => r.id === firstReview).replies
          .length,
      );
    },
  );
  await check(
    "complaints require an assigned authority and ignore client routing",
    async () => {
      await api(
        consumer,
        `/services/${noRouteService}/complaints`,
        "POST",
        { description: "The service has an issue that needs investigation." },
        409,
      );
      const result = await api(
        consumer,
        `/services/${serviceId}/complaints`,
        "POST",
        {
          description:
            "I requested connection support but the problem remains unresolved.",
          assignmentId: "00000000-0000-0000-0000-000000000000",
        },
        201,
      );
      complaintId = result.id;
      const record = (
        await client!.query(
          "SELECT * FROM company_feedback.complaints WHERE id=$1",
          [complaintId],
        )
      ).rows[0];
      assert.equal(record.assignment_id, assignmentId);
      assert.equal(
        record.response_due_at.getTime() - record.submitted_at.getTime(),
        72 * 60 * 60 * 1000,
      );
      assert.equal(record.first_response_at, null);
      assert.equal(
        Number(
          (
            await client!.query(
              "SELECT count(*) FROM company_feedback.notification_outbox WHERE complaint_id=$1 AND delivered_at IS NULL",
              [complaintId],
            )
          ).rows[0].count,
        ),
        2,
      );
    },
  );
  await check(
    "private complaint access excludes outsiders and unassigned administrators",
    async () => {
      await api(rep, `/complaints/${complaintId}`);
      await api(assessor, `/complaints/${complaintId}`);
      await api(outsider, `/complaints/${complaintId}`, "GET", undefined, 404);
      await api(admin, `/complaints/${complaintId}`, "GET", undefined, 404);
      await api(anonymous, `/complaints/${complaintId}`, "GET", undefined, 401);
      assert.equal((await api(outsider, "/complaints")).length, 0);
    },
  );
  await check(
    "assessor findings do not count as the organization’s first response",
    async () => {
      await api(
        assessor,
        `/complaints/${complaintId}/messages`,
        "POST",
        { body: "Please provide the date and receipt for assessment." },
        201,
      );
      assert.equal(
        (
          await client!.query(
            "SELECT first_response_at FROM company_feedback.complaints WHERE id=$1",
            [complaintId],
          )
        ).rows[0].first_response_at,
        null,
      );
    },
  );
  await check(
    "evidence validates contents and enforces authorization on every download",
    async () => {
      const bad = await consumer.post(
        `/api/v1/complaints/${complaintId}/attachments`,
        {
          multipart: {
            file: {
              name: "fake.png",
              mimeType: "image/png",
              buffer: Buffer.from("<script>bad</script>"),
            },
          },
        },
      );
      assert.equal(bad.status(), 400);
      const good = await consumer.post(
        `/api/v1/complaints/${complaintId}/attachments`,
        {
          multipart: {
            file: {
              name: "fictional-receipt.pdf",
              mimeType: "application/pdf",
              buffer: Buffer.from("%PDF-1.7\nFictional test document"),
            },
          },
        },
      );
      assert.equal(good.status(), 201);
      const detail = await api(consumer, `/complaints/${complaintId}`);
      attachmentId = detail.attachments[0].id;
      assert.ok(!JSON.stringify(detail).includes("storage_key"));
      for (const ctx of [consumer, rep, assessor]) {
        const r = await ctx.get(
          `/api/v1/complaints/${complaintId}/attachments/${attachmentId}`,
        );
        assert.equal(r.status(), 200);
        assert.match(r.headers()["cache-control"], /no-store/);
        assert.match(await r.text(), /^%PDF/);
      }
      await api(
        outsider,
        `/complaints/${complaintId}/attachments/${attachmentId}`,
        "GET",
        undefined,
        404,
      );
      await api(
        admin,
        `/complaints/${complaintId}/attachments/${attachmentId}`,
        "GET",
        undefined,
        404,
      );
      await api(
        anonymous,
        `/complaints/${complaintId}/attachments/${attachmentId}`,
        "GET",
        undefined,
        401,
      );
    },
  );
  await check(
    "first organization response is recorded once; proposal alone remains pending",
    async () => {
      await api(
        rep,
        `/complaints/${complaintId}/messages`,
        "POST",
        {
          body: "We acknowledge your report and will check the connection request.",
        },
        201,
      );
      const first = (
        await client!.query(
          "SELECT first_response_at FROM company_feedback.complaints WHERE id=$1",
          [complaintId],
        )
      ).rows[0].first_response_at;
      assert.ok(first);
      await api(
        rep,
        `/complaints/${complaintId}/resolution-proposals`,
        "POST",
        {
          description:
            "We will complete the requested connection and refund the duplicate installation fee.",
        },
        201,
      );
      const detail = await api(consumer, `/complaints/${complaintId}`);
      proposalId = detail.proposals[0].id;
      assert.equal(detail.complaint.status, "PENDING");
      assert.equal(
        new Date(detail.complaint.first_response_at).getTime(),
        first.getTime(),
      );
    },
  );
  await check("only the submitting consumer confirms resolution", async () => {
    await api(
      rep,
      `/resolution-proposals/${proposalId}/confirm`,
      "POST",
      {},
      404,
    );
    await api(
      outsider,
      `/resolution-proposals/${proposalId}/confirm`,
      "POST",
      {},
      404,
    );
    await api(
      consumer,
      `/resolution-proposals/${proposalId}/confirm`,
      "POST",
      {},
    );
    assert.equal(
      (await api(consumer, `/complaints/${complaintId}`)).complaint.status,
      "RESOLVED",
    );
    await api(
      rep,
      `/complaints/${complaintId}/messages`,
      "POST",
      { body: "This late message should not be accepted." },
      409,
    );
  });
  await check(
    "overdue job authentication, deduplication, and SMTP delivery",
    async () => {
      overdueId = (
        await api(
          consumer,
          `/services/${serviceId}/complaints`,
          "POST",
          {
            description:
              "A second issue is still awaiting an organization response.",
          },
          201,
        )
      ).id;
      // Only this disposable local fixture bypasses time immutability to simulate 73 elapsed hours.
      await client!.query("SET session_replication_role=replica");
      try {
        await client!.query(
          "UPDATE company_feedback.complaints SET submitted_at=now()-interval '73 hours',response_due_at=now()-interval '1 hour' WHERE id=$1",
          [overdueId],
        );
      } finally {
        await client!.query("SET session_replication_role=origin");
      }
      await api(anonymous, "/jobs/maintenance", "GET", undefined, 401);
      const r = await anonymous.get("/api/v1/jobs/maintenance", {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      assert.equal(r.status(), 200);
      assert.equal((await r.json()).queued, 2);
      const second = await anonymous.get("/api/v1/jobs/maintenance", {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      assert.equal((await second.json()).queued, 0);
      const rows = (
        await client!.query(
          "SELECT delivered_at,event_type FROM company_feedback.notification_outbox WHERE complaint_id=$1",
          [overdueId],
        )
      ).rows;
      assert.equal(rows.length, 4);
      assert.ok(rows.every((r) => r.delivered_at));
    },
  );
  await check(
    "outbox failures remain pending, back off, and retry successfully",
    async () => {
      const id = (
        await api(
          consumer,
          `/services/${serviceId}/complaints`,
          "POST",
          {
            description:
              "A fictional complaint specifically for notification retry checks.",
          },
          201,
        )
      ).id;
      rejectTestMail = true;
      try {
        const r = await anonymous.get("/api/v1/jobs/maintenance", {
          headers: { Authorization: `Bearer ${cronSecret}` },
        });
        assert.equal(r.status(), 200);
        assert.equal((await r.json()).failed, 2);
      } finally {
        rejectTestMail = false;
      }
      let rows = (
        await client!.query(
          "SELECT attempts,delivered_at,last_error FROM company_feedback.notification_outbox WHERE complaint_id=$1",
          [id],
        )
      ).rows;
      assert.ok(
        rows.every(
          (r) => r.attempts === 1 && r.delivered_at === null && r.last_error,
        ),
      );
      const early = await anonymous.get("/api/v1/jobs/maintenance", {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      assert.equal((await early.json()).delivered, 0);
      await client!.query(
        "UPDATE company_feedback.notification_outbox SET created_at=now()-interval '6 minutes' WHERE complaint_id=$1",
        [id],
      );
      const retry = await anonymous.get("/api/v1/jobs/maintenance", {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      assert.equal((await retry.json()).delivered, 2);
      rows = (
        await client!.query(
          "SELECT attempts,delivered_at,last_error FROM company_feedback.notification_outbox WHERE complaint_id=$1",
          [id],
        )
      ).rows;
      assert.ok(
        rows.every(
          (r) => r.attempts === 2 && r.delivered_at && r.last_error === null,
        ),
      );
    },
  );
  await check(
    "calendar-month windows release old slots and unrated services expose null",
    async () => {
      const result = await api(anonymous, `/services/${noRouteService}`);
      assert.equal(result.average_rating, null);
      assert.equal(Number(result.reviewer_count), 0);
      const sid = (
        await api(
          rep,
          `/organizations/${orgId}/services`,
          "POST",
          { name: "Fictional calendar boundary service", isActive: true },
          201,
        )
      ).id;
      const old = (
        await api(
          c,
          `/services/${sid}/reviews`,
          "POST",
          {
            stars: 5,
            comment: "Fictional retained review before the boundary.",
          },
          201,
        )
      ).id;
      await api(
        c,
        `/services/${sid}/reviews`,
        "POST",
        { stars: 3, comment: "Fictional retained review within the boundary." },
        201,
      );
      await api(
        c,
        `/services/${sid}/reviews`,
        "POST",
        {
          stars: 4,
          comment: "This additional review must initially be blocked.",
        },
        409,
      );
      await client!.query("SET session_replication_role=replica");
      try {
        await client!.query(
          "UPDATE company_feedback.reviews SET created_at=((now() AT TIME ZONE 'UTC')-interval '3 months'-interval '1 second') AT TIME ZONE 'UTC' WHERE id=$1",
          [old],
        );
      } finally {
        await client!.query("SET session_replication_role=origin");
      }
      await api(
        c,
        `/services/${sid}/reviews`,
        "POST",
        {
          stars: 4,
          comment: "An older retained review has left the rolling window.",
        },
        201,
      );
      assert.equal(
        (
          await client!.query(
            "SELECT (date '2026-05-31' - interval '3 months')::date = date '2026-02-28' AS correct",
          )
        ).rows[0].correct,
        true,
      );
    },
  );
  await check(
    "assignment changes preserve historical complaint access",
    async () => {
      await api(
        admin,
        "/admin/assessor-assignments",
        "POST",
        { organizationId: orgId, authorityId: authority2Id },
        201,
      );
      assert.equal(
        (await api(assessor, `/complaints/${complaintId}`)).complaint
          .assignment_id,
        assignmentId,
      );
      await api(assessor2, `/complaints/${complaintId}`, "GET", undefined, 404);
    },
  );
  await check(
    "organization access changes preserve description and contact information",
    async () => {
      await api(admin, `/admin/organizations/${orgId}`, "PATCH", {
        isActive: false,
      });
      const record = (
        await client!.query(
          "SELECT description,contact_email FROM company_feedback.organizations WHERE id=$1",
          [orgId],
        )
      ).rows[0];
      assert.equal(record.contact_email, "hello@example.test");
      assert.ok(record.description);
      await api(admin, `/admin/organizations/${orgId}`, "PATCH", {
        isActive: true,
      });
    },
  );
  await check(
    "public-content moderation hides text without changing ratings or deleting history",
    async () => {
      await api(
        b,
        `/reviews/${firstReview}/report`,
        "POST",
        { reason: "Fictional test report for moderator review." },
        201,
      );
      const reportId = (
        await client!.query(
          "SELECT id FROM company_feedback.public_content_reports WHERE review_id=$1",
          [firstReview],
        )
      ).rows[0].id;
      const rating = (await api(anonymous, `/services/${serviceId}`))
        .average_rating;
      await api(admin, `/admin/reports/${reportId}`, "PATCH", {
        status: "HIDDEN",
        note: "Fictional moderator finding for an isolated test.",
      });
      const result = await api(anonymous, `/services/${serviceId}/reviews`);
      assert.ok(!result.some((r: { id: string }) => r.id === firstReview));
      assert.equal(
        (await api(anonymous, `/services/${serviceId}`)).average_rating,
        rating,
      );
    },
  );
  await check(
    "verification attempts and resend frequency are limited",
    async () => {
      const unverified = await context();
      await api(
        unverified,
        "/auth/register",
        "POST",
        {
          username: "fictional_limited",
          email: "fictional_limited@example.test",
          password: testPassword,
        },
        201,
      );
      await api(unverified, "/auth/login", "POST", {
        email: "fictional_limited@example.test",
        password: testPassword,
      });
      await api(unverified, "/auth/resend-verification", "POST", {});
      const rightCode =
        messages.at(-1)?.match(/verification code is (\d{6})/)?.[1] || "";
      await api(unverified, "/auth/resend-verification", "POST", {}, 429);
      for (let n = 0; n < 5; n++)
        await api(
          unverified,
          "/auth/verify-email",
          "POST",
          { code: rightCode === "000000" ? "000001" : "000000" },
          400,
        );
      await api(
        unverified,
        "/auth/verify-email",
        "POST",
        { code: rightCode },
        400,
      );
    },
  );
  await check("expired codes cannot verify an account", async () => {
    const expired = await context();
    await api(
      expired,
      "/auth/register",
      "POST",
      {
        username: "fictional_expired",
        email: "fictional_expired@example.test",
        password: testPassword,
      },
      201,
    );
    await api(expired, "/auth/login", "POST", {
      email: "fictional_expired@example.test",
      password: testPassword,
    });
    await api(expired, "/auth/resend-verification", "POST", {});
    const expiredCode =
      messages.at(-1)?.match(/verification code is (\d{6})/)?.[1] || "";
    await client!.query(
      "UPDATE company_feedback.email_verification_codes SET created_at=now()-interval '11 minutes',expires_at=now()-interval '1 minute' WHERE user_id=(SELECT id FROM company_feedback.users WHERE username='fictional_expired')",
    );
    await api(
      expired,
      "/auth/verify-email",
      "POST",
      { code: expiredCode },
      400,
    );
  });
  await browserChecks({
    consumer,
    rep,
    assessor,
    admin,
    serviceId,
    complaintId,
    orgId,
  });
  await check(
    "deactivated memberships immediately lose private complaint and evidence access",
    async () => {
      const membership = (
        await client!.query(
          "SELECT id FROM company_feedback.memberships WHERE user_id=$1",
          [repId],
        )
      ).rows[0].id;
      await api(admin, `/admin/memberships/${membership}`, "PATCH", {
        isActive: false,
      });
      await api(rep, `/complaints/${complaintId}`, "GET", undefined, 404);
      await api(
        rep,
        `/complaints/${complaintId}/attachments/${attachmentId}`,
        "GET",
        undefined,
        404,
      );
    },
  );
  await check(
    "disabling an account revokes its database sessions",
    async () => {
      await api(admin, `/admin/users/${bId}`, "PATCH", { isActive: false });
      await api(b, "/me", "GET", undefined, 401);
      assert.equal(
        Number(
          (
            await client!.query(
              "SELECT count(*) FROM company_feedback.app_sessions WHERE user_id=$1",
              [bId],
            )
          ).rows[0].count,
        ),
        0,
      );
    },
  );
  await check("logout revokes the server session", async () => {
    await api(consumer, "/auth/logout", "POST", {});
    await api(consumer, "/me", "GET", undefined, 401);
    assert.equal(
      Number(
        (
          await client!.query(
            "SELECT count(*) FROM company_feedback.app_sessions WHERE user_id=$1",
            [consumerId],
          )
        ).rows[0].count,
      ),
      0,
    );
  });
  await writeFile(join(root, "server-errors.log"), serverErrors);
  await mkdir("docs/verification", { recursive: true });
  await writeFile(
    "docs/verification/system-result.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        database: "disposable local PostgreSQL",
        passed,
        productionDataTouched: false,
        artifacts: "artifacts/",
        externalEmailProviderTested: false,
        externalStorageTested: false,
      },
      null,
      2,
    ),
  );
  console.log(
    `Completed ${passed} system checks. Temporary services stopped during cleanup. Production data was not touched.`,
  );
}
async function browserChecks(input: {
  consumer: APIRequestContext;
  rep: APIRequestContext;
  assessor: APIRequestContext;
  admin: APIRequestContext;
  serviceId: string;
  complaintId: string;
  orgId: string;
}) {
  const browser = await chromium.launch({
    headless: true,
    ...(existsSync("/usr/bin/google-chrome") ? { channel: "chrome" } : {}),
  });
  try {
    await mkdir("artifacts", { recursive: true });
    await check(
      "desktop and mobile pages fit their viewport and have no serious accessibility violations",
      async () => {
        const auditFailures: string[] = [];
        for (const width of [1440, 390]) {
          const browserContext = await browser.newContext({
              viewport: { width, height: 1000 },
            }),
            page = await browserContext.newPage();
          for (const [path, label] of [
            ["/", "home"],
            ["/organizations", "directory"],
            [`/organizations/${input.orgId}`, "organization"],
            [`/services/${input.serviceId}`, "service"],
            ["/login", "login"],
            ["/register", "register"],
          ]) {
            await page.goto(base + path, { waitUntil: "networkidle" });
            assert.ok(await page.locator("h1,h2").count());
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
              ),
              true,
              `${label} overflows at ${width}px`,
            );
            await page.screenshot({
              path: `artifacts/${label}-${width}.png`,
              fullPage: true,
            });
            const result = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze();
            const violations = result.violations
              .filter((v) => ["critical", "serious"].includes(v.impact || ""))
              .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }));
            if (violations.length)
              auditFailures.push(
                `${label} at ${width}px: ${JSON.stringify(violations)}`,
              );
            await page.screenshot({
              path: `artifacts/${label}-${width}.png`,
              fullPage: true,
            });
          }
          await page.goto(base + "/login");
          await page.keyboard.press("Tab");
          assert.equal(
            await page.locator(":focus").textContent(),
            "Skip to content",
          );
          await page.keyboard.press("Enter");
          assert.ok(
            await page
              .locator("#main")
              .evaluate(
                (el) =>
                  el.contains(document.activeElement) ||
                  el === document.activeElement,
              ),
          );
          await browserContext.close();
        }
        assert.deepEqual(auditFailures, [], "Public-page accessibility checks");
      },
    );
    await check(
      "role dashboards and private detail render on desktop and mobile",
      async () => {
        for (const [ctx, path, label] of [
          [input.consumer, "/workspace", "consumer"],
          [input.rep, "/workspace/organization", "representative"],
          [input.assessor, "/workspace/assessor", "assessor"],
          [input.admin, "/workspace/admin", "admin"],
          [input.consumer, `/services/${input.serviceId}`, "review-form"],
          [
            input.consumer,
            `/workspace/complaints/${input.complaintId}`,
            "complaint",
          ],
        ] as const) {
          for (const width of [1440, 390]) {
            const context = await browser.newContext({
                storageState: await ctx.storageState(),
                viewport: { width, height: 1000 },
              }),
              page = await context.newPage();
            await page.goto(base + path, { waitUntil: "networkidle" });
            assert.ok(!page.url().includes("/login"));
            assert.equal(await page.locator("main h1").count(), 1);
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= window.innerWidth,
              ),
              true,
              `${label} overflows`,
            );
            await page.screenshot({
              path: `artifacts/${label}-${width}.png`,
              fullPage: true,
            });
            const result = await new AxeBuilder({ page })
              .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
              .analyze();
            assert.deepEqual(
              result.violations
                .filter((v) => ["critical", "serious"].includes(v.impact || ""))
                .map((v) => ({ id: v.id, help: v.help })),
              [],
              `${label} has accessibility issues`,
            );
            await page.screenshot({
              path: `artifacts/${label}-${width}.png`,
              fullPage: true,
            });
            await context.close();
          }
        }
      },
    );
    await check(
      "failed forms keep typed input and show a useful error",
      async () => {
        const context = await browser.newContext(),
          page = await context.newPage();
        await page.goto(base + "/login");
        await page.getByLabel("Email address").fill("unknown@example.test");
        await page.getByLabel(/^Password/).fill("An-incorrect-password");
        await page
          .getByRole("button", { name: "Sign in", exact: true })
          .click();
        await page.getByRole("alert").waitFor();
        assert.equal(
          await page.getByLabel("Email address").inputValue(),
          "unknown@example.test",
        );
        assert.equal(
          await page.getByLabel(/^Password/).inputValue(),
          "An-incorrect-password",
        );
        await context.close();
      },
    );
  } finally {
    await browser.close();
  }
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "System checks failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const c of contexts) await c.dispose();
    if (server) {
      server.kill("SIGTERM");
      await new Promise<void>((r) => {
        if (server!.exitCode !== null) r();
        else {
          server!.once("exit", () => r());
          setTimeout(() => {
            server?.kill("SIGKILL");
            r();
          }, 5000).unref();
        }
      });
    }
    smtp.close();
    await client?.end();
    if (startedPg)
      spawnSync(
        join(PG_BIN, "pg_ctl"),
        ["-D", join(root, "postgres"), "-m", "fast", "-w", "stop"],
        { stdio: "ignore" },
      );
  });
