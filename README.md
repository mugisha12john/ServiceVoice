# ServiceVoice

Company Service Evaluation and Complaint Management System. A Next.js App Router application with TypeScript, Tailwind CSS, Lucide, React Hook Form, Zod, Drizzle, PostgreSQL/Neon, Auth.js, private evidence storage, and an email outbox worker.

## UI

![alt text](artifacts/home-1440.png)

## Start locally

Use Node.js 22 LTS or newer and npm. The lockfile records the tested dependency versions.

```bash
npm ci
cp -n .env.example .env.local
```

If `.env.local` already exists, **preserve it** and add missing settings instead of copying over it. Set `DATABASE_URL` to the existing Neon database. Set `AUTH_URL` and `APP_URL` to `http://localhost:3000`. Generate independent random `AUTH_SECRET` and `CRON_SECRET` values of at least 32 characters using a trusted password manager. Keep all environment files private.

The current local configuration uses the existing Neon database, generated authentication/job secrets, and migration 001. Gmail SMTP connection, TLS, and authentication were verified; inbox delivery has not been tested. Private local file storage is enabled in `.private-uploads`. A read-only database check confirmed that the first administrator already exists; sign in with the existing account.

Before another deployment, inspect the target database and review the additive migration:

```bash
npm run db:inspect
npm run db:migrate
npm run dev
```

Open <http://localhost:3000>. Public discovery works without authentication. An empty registry displays an honest empty state until the administrator registers organizations and representatives add services.

`db:inspect` reads schema metadata, constraints, views, and trigger/function definitions; it never reads account or complaint contents. It writes `docs/schema-inspection.json`. `db:migrate` only installs the three support tables in `migrations/001_application_support.sql`. It uses an advisory transaction lock, skips an already complete installation, and refuses a partial installation. There is no migration or synchronization on startup.

**Never run `database/reference-schema.sql` against your existing Neon database.** That is an unchanged copy of the supplied baseline, retained for isolated tests and schema reference. It is not a migration for the deployed database. Do not run Drizzle push or recreate the schema.

## First super administrator

After applying migration 001, run this in a trusted interactive terminal:

```bash
npm run admin:create
```

The script checks for an existing administrator before prompting for credentials, hides password input, hashes the password with bcrypt cost 12, and creates the first administrator only when no administrator exists. It rechecks under a transaction lock to prevent concurrent creation. It never promotes an existing account or overwrites an existing password. Do not put passwords in command arguments or environment examples. Sign in and verify the administrator’s mailbox through the normal email flow. Administrator access works before verification; contributing reviews/complaints requires verification.

If it reports that an administrator already exists, use `/login` with that account's email and original password. An unsuccessful bootstrap does not set the password entered at its prompt. Duplicate email/username, invalid input, and common database/network errors have separate explanations, with sensitive database details withheld. An unavailable or disabled administrator requires a deliberate recovery procedure, not rerunning bootstrap with another email.

Then use **Administration → Organizations**, **Staff & memberships**, and **Assessor assignments**:

1. Register the service organization and its assessing authority (`can_assess = true`).
2. Create staff accounts or select existing accounts; assign representative/assessor memberships.
3. Assign the authority to the service organization.
4. Representatives add individual or combined service listings.
5. Staff sign in and verify their mailbox so they can receive notification emails.

The bootstrap refuses additional administrators. Further administrator grants, account recovery, and emergency administrator recovery require a deliberate operator procedure rather than a public endpoint. Never share an administrator account.

To add an assessor, open **Administration → Staff & memberships** and follow **Set up an assessor**. First use **Register an assessing authority** to register the organization they work for, with assessment enabled and active status selected. The form then opens assessor membership with the new authority selected. Choose the assessor's existing account, or create a staff account first. Finally open **Assessor assignments** and choose the service company that authority will inspect. An assessor joins the authority, rather than the company being inspected. The role selector only lists active authorities for assessor memberships, and explains how to register one when none exist. For an existing authority, open **Organizations & authorities → Edit registration details** to enable its assessment checkbox.

Public review replies display the service organization's name and the **Organization reply** badge. The representative's author ID remains recorded internally for authorization and accountability; their personal username is not used as the public reply heading.

## Email

Configure an authenticated SMTP provider using the server-only `SMTP_*` and `EMAIL_FROM` variables. Use port 587 with required STARTTLS (`SMTP_SECURE=false`, `SMTP_REQUIRE_TLS=true`) or port 465 with TLS (`SMTP_SECURE=true`). Verify the sender domain with your provider and its SPF/DKIM settings. Disable TLS requirements only for an isolated local SMTP test server.

Consumers register, sign in, request a code on `/verify-email`, and submit the six-digit code. Codes use a cryptographically secure generator and HMAC-SHA-256 with `AUTH_SECRET`, expire after 10 minutes, allow five failed attempts, and are single use. Issuing a new code invalidates older codes. Resends require at least 60 seconds between messages and are limited to five per rolling hour. Attempts/resends are serialized or persisted in PostgreSQL. Login allows ten attempts per email per 15-minute bucket. Keep deployment edge/IP abuse limits enabled as well.

No code is logged, displayed as a development shortcut, or included in API responses. Provider acceptance is reported as acceptance, not proof that an inbox received a message. Missing settings produce a configuration message. An unsuccessful send invalidates that code; the user can request another after the resend limit.

## Private evidence storage

File storage holds complaint images and documents; Neon stores their metadata. For deployment, use either a private S3-compatible bucket or a persistent disk on a paid Render web service. The [deployment guide](docs/deployment.md) gives the settings for both hosts.

Configure S3 through `STORAGE_DRIVER=s3`, `STORAGE_BUCKET`, `STORAGE_REGION`, optional `STORAGE_ENDPOINT`, and dedicated access keys. Keep public bucket/object access disabled. Grant only object get/put/delete within the application prefix. Application pages never receive a storage key or a public object URL. Authorized downloads go through `/api/v1/complaints/{id}/attachments/{attachmentId}` and use `attachment`, `nosniff`, and `private, no-store` headers.

For local development only:

```dotenv
STORAGE_DRIVER=local
PRIVATE_UPLOAD_DIR=.private-uploads
```

Local files use restricted filesystem permissions and must stay outside `public/`. This mode is enabled in the current local environment. On Render, set the path to an attached persistent disk; local storage is unsuitable for ephemeral serverless deployments. The example S3 configuration shows an honest unavailable message until credentials are supplied. A complaint can be submitted without evidence; files are added on its detail page. Failed uploads keep the selected file and report the failure; failed metadata writes trigger object cleanup.

Allowed evidence: genuine PDF, PNG, JPEG, and WebP, up to 10 MiB each, at most 20 files per complaint. The server checks the byte size, extension, MIME type, and signature, and bounds streamed requests before parsing. This is format validation, not malware scanning. Keep files as downloads and consider a quarantine/scanning provider before accepting high-risk real-world documents.

## Scheduled maintenance and outbox delivery

The authenticated worker is `GET` or `POST /api/v1/jobs/maintenance`, with `Authorization: Bearer <CRON_SECRET>`. The secret must have at least 32 characters. Schedule it every five minutes. Without an external schedule, no background process runs by itself.

The worker invokes the existing `enqueue_overdue_complaints()` function. The database deduplicates each overdue recipient/event pair. It then processes up to ten eligible outbox tasks within a bounded worker budget, claiming rows with `FOR UPDATE SKIP LOCKED`. It sends minimal notices (reference and sign-in link, no complaint contents) to active verified members of the recipient organization/role using BCC. Provider acceptance sets `delivered_at`; it is not confirmation of inbox delivery.

Failures increment `attempts`, store a sanitized `last_error`, and remain pending. Retry eligibility is based on creation time plus `min(3600, attempts² × 60)` seconds, using the existing schema. Eight unsuccessful attempts require operator review. SMTP is **at least once**: a crash after provider acceptance but before committing may cause a duplicate email. Overdue outbox insertion itself is deduplicated. These guarantees are distinct.

The worker also removes expired sessions, expired abuse counters, and verification codes more than seven days past expiry. It never deletes complaints or evidence. Monitor `pending`, `failed`, and `exhausted` in worker responses, and query outbox attempt/error fields with a restricted operator account. After correcting a delivery problem, an operator may deliberately reset `attempts` for selected undelivered rows; never clear a delivered row or insert duplicate events.

### Hosting

For the current Gmail SMTP and 10 MiB attachment flow, a paid Render Node web service with a persistent disk is the most direct deployment. The [Render/Vercel deployment guide](docs/deployment.md) includes build commands, environment settings, storage, and scheduling. Render's free service blocks SMTP ports; Vercel's 4.5 MB function request/response limit requires changes to the current attachment upload and download flow before using the full file allowance. Sources and alternatives are linked in that guide.

### Vercel

After addressing the attachment transfer limit described in the deployment guide, set all secrets in the project’s server environment, configure a Node.js runtime with PostgreSQL outbound access, build with `npm run build`, and use an external private S3-compatible bucket. Set `AUTH_URL` and `APP_URL` to the same canonical HTTPS origin. Run `db:migrate` manually against each intended database before promoting the application. Use a dedicated preview database, never production data for automated tests.

`deployment/vercel.example.json` contains an optional five-minute schedule; copy it to `vercel.json` only on a plan supporting that frequency. Vercel sends the configured `CRON_SECRET` as the bearer authorization header. Confirm the schedule is enabled after deployment. See the [official cron documentation](https://vercel.com/docs/cron-jobs/manage-cron-jobs). A VPS, container platform, or external scheduler can call the same protected endpoint on a five-minute schedule instead. Keep secrets in the scheduler’s secret store, never in a tracked URL or command.

For a persistent Node host, run `npm run build` and `npm start` behind HTTPS. Preserve private object storage independently of application deployments. Size the small PostgreSQL pool (`max: 5` per application process) for the chosen concurrency. Neon pooled connection strings are supported. Use TLS certificate verification; do not disable it to fix connection problems.

### Database privileges

Use a dedicated backend database role rather than the Neon owner role for runtime. After reviewing privileges, grant schema usage, the table operations needed by the services, sequence usage, and execution of the supplied business functions. Migrations and first-admin bootstrap need a trusted operator connection. The supplied schema relies on server authorization; it does not implement end-user row-level security. Never provide database credentials to a browser or expose arbitrary SQL endpoints.

Before launching to real users, configure Neon recovery/PITR for your plan, test restoration on a separate branch, back up private objects, agree on retention and account-recovery policies, and exercise your real email/storage providers. These policies were open in the requirements draft and have not been invented here.

## Architecture and business rules

`src/app` contains Server Component pages and a versioned REST adapter. `src/components` contains reusable presentation and interactive forms. `src/lib/services` contains reusable business operations; API handlers never accept ownership/author IDs from request bodies. `src/lib/permissions.ts` centralizes authentication and database-backed access checks. All database/storage/email modules are server-only. Drizzle SQL templates bind user values as query parameters. Auth.js uses encrypted HttpOnly cookies plus hashed, expiring server-side session records; account disabling and logout revoke the records. Every request rechecks account and membership access.

The database controls rolling three-calendar-month UTC review windows, concurrency, immutable creation time, latest-rating fallback, active-service validation, complaint routing, 72 elapsed hours, first organization response, and consumer-confirmed resolution. The application reads the existing rating views. A numeric complaint reference is formatted `CMP-000123`, without inventing a year or replacing its stored identity.

See [decisions and requirements](docs/decisions.md), [API reference](docs/api.md), and [completion report](docs/completion.md). Auth.js remains security maintained under the [Better Auth team](https://better-auth.com/blog/authjs-joins-better-auth); its credentials integration was chosen to preserve existing password hashes/user columns. The pinned v5 release is a beta; reassess its upstream release/support status during future maintenance.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm audit --omit=dev
```

The full system suite uses an installed Google Chrome when available, otherwise Playwright’s headless Chromium. It requires PostgreSQL server binaries (`initdb` and `pg_ctl`, default `/usr/lib/postgresql/18/bin`) and Playwright’s headless Chromium:

```bash
npx playwright install chromium --only-shell
npm run test:system
```

Set `PG_TEST_BIN` if the binaries are elsewhere. The suite starts its own temporary local PostgreSQL cluster, test SMTP server, private file directory, and production Next.js server, then stops them. It never connects to `DATABASE_URL`, never uses Neon, and never seeds your database. Its fictional fixtures stay in a temporary cluster. Do not run the suite as root. Default test ports are 3107, 55439, and 10289; override `SYSTEM_TEST_PORT`, `PG_TEST_PORT`, and `SMTP_TEST_PORT` as needed.

The suite checks API workflows, real PostgreSQL triggers, concurrent review submissions, SMTP verification, private local storage, role restrictions, and desktop/mobile/keyboard/axe accessibility behavior. Screenshots are written to ignored `artifacts/`; a sanitized result is written to `docs/verification/system-result.json`. Local SMTP acceptance and local private storage do not verify an external provider or production schedule.

There is no automatic production seed, no fake directory content, no Top 10 leaderboard, and no awards feature.
