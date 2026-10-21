# Completion report

## Implemented

- Next.js App Router/TypeScript application, responsive sage/forest interface, public search/filter directory, organization/service pages, reviews/replies, and useful empty/error states.
- Auth.js login/logout, bcrypt passwords, server-revocable sessions, consumer-only signup, HMAC email-code verification, persistent limits, server-side account/membership/ownership checks.
- Consumer, representative, assessor, and super-administrator workspaces; profile/service management, staff memberships, assessor assignments, account access, and reported-content moderation.
- Existing Neon schema mapped in Drizzle; parameterized queries and reusable server-only services. Existing rating views and workflow triggers remain authoritative.
- Review allowance/latest-rating/deletion behavior; private complaint routing/discussions/evidence; 72-hour first organization response; immutable proposals and consumer confirmation.
- Private S3-compatible or explicitly configured development-local storage, protected downloads, type/signature/size limits, SMTP delivery, overdue/outbox worker, retry/error handling, optional deployment schedule example.
- Explicit additive migration, secure first-admin bootstrap, environment placeholders, setup/deployment/API/decision documentation, unit and isolated full-system tests.

## Configuration remaining

- A read-only check confirmed that the requested email already belongs to an active super administrator. Sign in with its existing password; the failed bootstrap did not change it. The script now explains this before prompting for new credentials. No real account was created, promoted, or reset during this fix.
- Gmail SMTP is configured locally. The provider connection, TLS, and authentication checks passed without sending email; sender-to-inbox delivery still needs an application verification-email test.
- Private local storage is enabled in `.private-uploads` with restricted permissions. For deployment, use a paid Render persistent disk or configure a private S3-compatible bucket. External S3 integration remains untested.
- Provision hosting and enable the external five-minute maintenance schedule. An endpoint and deployment example do not establish that a schedule is running.
- Finalize the open retention, account-recovery, and moderation/appeal policies before a real-user launch.

The supplied `.env.local` database credentials and database target were preserved. Its TLS mode is now explicitly `verify-full`, retaining certificate verification and removing the pg compatibility warning. Local authentication and job secrets were generated privately. The reviewed migration added three support tables without changing existing schema objects/data. The original baseline inspection is retained in `docs/schema-inspection.json`.

The [deployment guide](deployment.md) covers Render and Vercel, including the persistent-disk option, Render free-tier SMTP restriction, and the Vercel payload limit affecting current attachment transfers. A scheduler runner is provided; hosting and scheduling have not been activated.

## Verification

Completed on 21 October 2026:

| Check                              | Result                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production build                   | Passed, Next.js 16.4.2                                                                                                                            |
| TypeScript check                   | Passed                                                                                                                                            |
| ESLint                             | Passed, no warnings                                                                                                                               |
| Unit tests                         | 17 passed                                                                                                                                         |
| Isolated full-system checks        | 36 passed                                                                                                                                         |
| Browser checks                     | 24 page/viewport combinations, 1440px desktop and 390px phone; no document overflow or serious/critical axe violations                            |
| Keyboard and failed-input behavior | Skip navigation and failed form input preservation passed                                                                                         |
| Live Neon integration              | Public directory and login passed; unauthenticated profile API returned 401                                                                       |
| Original Neon schema objects       | Original columns, functions, and views confirmed unchanged after migration                                                                        |
| Credential scan                    | No configured database/auth/job secrets in source, docs, examples, or browser bundles                                                             |
| Production dependency audit        | Zero vulnerabilities                                                                                                                              |
| Administrator bootstrap            | Confirmed existing-admin guard on Neon; duplicate-account, disabled-admin, password hashing, and concurrency checks passed in isolated PostgreSQL |
| Scheduler runner                   | Local HTTP fixture verified success, failure redaction, redirect refusal, and missing configuration; no real worker invoked                       |

Full-system checks use a disposable local PostgreSQL cluster, a local SMTP server, and private local file storage; they never write fixtures to Neon. They cover registration/verification, attempt/resend/expiry limits, server sessions and role restrictions, ownership, concurrent rating limits, UTC calendar windows, latest-rating fallback/deletion, private complaint/evidence access, automatic routing, 72-hour timing, first-response tracking, outbox failure/backoff/deduplication, assignment history, consumer-only confirmation, moderation, and immediate membership/account revocation. Temporary test services and the read-only live smoke server were stopped.

The installed Google Chrome was used for browser checks. The attempted Playwright browser download was unnecessary and stopped. Screenshots containing clearly fictional temporary fixtures are in ignored `artifacts/`; machine-readable results are in `docs/verification/`. Automated accessibility checks supplement visual/keyboard inspection and do not certify complete WCAG conformance.

The full dependency audit still reports five high-severity entries in the development-only ESLint/Next lint dependency chain, rooted in the unpatched `braces` advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The production dependency audit is clean. A forced downgrade of the Next.js lint configuration was avoided; reassess upstream fixes during maintenance.

Actual external email inbox delivery, external private object storage, a deployed scheduler, and real-user load/recovery targets cannot be certified from local test providers.
