# Requirements and implementation decisions

Sources inspected: the supplied requirements DOCX (version 0.1, 16 October 2026), endpoint proposal DOCX, supplied SQL, three attached diagrams, the empty repository, and live Neon schema metadata/functions. Attached document instructions were treated as reference material rather than authorization to run the original schema creation script. The user’s explicit request settles the draft’s open rules and overrides proposed examples.

## Confirmed requirements

- PostgreSQL schema `company_feedback`; the inspected baseline has **13 tables and three views**. Live columns, view definitions, constraints, and business trigger functions match the supplied SQL. No pre-existing application files or applicable AGENTS.md were present.
- Public signup only creates consumer accounts. Memberships and administrator access are assigned through controlled administrative workflows.
- Verified accounts submit 1–5 whole-star service reviews with written feedback. Two active reviews per consumer/service in a rolling three-calendar-month UTC window, using the database’s strict `created_at > boundary` comparison.
- Only the latest active rating per consumer contributes, across all time. Edits preserve creation time. Soft deletion frees a slot and exposes the next latest retained rating. `average_rating = NULL` means “No ratings yet.”
- Public usernames/profile pictures; private account email. Email verification is not proof of consuming a service.
- Public reviews and private complaints remain separate. The database chooses the complaint’s service organization and active authority assignment, not request fields.
- Complaint access belongs to its consumer, organization representatives, and originally assigned authority’s assessors. Administrator privilege alone grants no access to complaint content or files.
- The first organization response has a 72-elapsed-hour deadline. Assessor messages do not satisfy it. Proposal submission may count as the first organization response under the supplied trigger, while leaving status Pending.
- Only the submitting verified consumer confirms an immutable proposal. Pending and Resolved are the only complaint statuses.
- Assignment changes end the old row and add a new row. Existing complaints retain their assignment.
- No production seed, destructive synchronization, leaderboard, awards, phone verification, payments, or automatic penalties.

## Implementation assumptions

- **Working product name:** ServiceVoice. This can be renamed; the system’s academic purpose and full name remain documented.
- **Session lifetime:** seven days, with encrypted Auth.js cookies and hashed session IDs stored in an additive session table. Logout/account disabling revokes database sessions. User and membership authorization is reloaded from PostgreSQL.
- **Passwords:** bcrypt cost 12, 12–72 UTF-8 bytes. The app never rewrites existing password hashes automatically. Existing passwords must use a supported bcrypt encoding to authenticate; unsupported legacy hashes require a deliberate recovery procedure.
- **Verification:** six digits, 10-minute expiry, five attempts, one issuance per 60 seconds, five per rolling hour. Codes are HMAC hashed using the private authentication secret. All live codes stay out of logs and responses.
- **Evidence:** PDF/PNG/JPEG/WebP, 10 MiB/file, 20 files/complaint. Evidence is added after complaint creation. Resolved complaints can retain/add supporting evidence; the supplied attachment trigger permits this. Discussions/proposals close when resolved.
- **Combined services:** a representative creates one listing and describes its related services together. Existing services/reviews/complaints are never automatically merged or reassigned.
- **Moderation:** signed-in verified users flag content, an administrator records a decision and reason, and hidden text is excluded from public pages/API responses. Records are retained. Hiding text does not change rating calculations or free a review slot. Criteria, appeals, restoration policy, and whether moderation should also remove scores remain product-policy decisions.
- **Assessment findings:** recorded as assessor messages in the shared private discussion. The schema has no finding category or assessor-only notes, so none are invented.
- **Notifications:** minimal SMTP notices to active verified recipient members. There is no claim of an active regulator partnership. Queue insertion, SMTP acceptance, and inbox delivery are distinct.
- **Operations:** a five-minute external job invocation; up to ten tasks/call and eight automatic attempts. No scheduling is implied by starting Next.js.
- **Display dates:** Africa/Kigali (CAT) for readable UI; PostgreSQL timestamps and rating calculations preserve UTC semantics. The reference is a formatted numeric identity, not the endpoint draft’s proposed year-based example.

## Additive migration review

`001_application_support.sql` adds only `app_sessions`, `security_rate_limits`, and `public_content_reports`, with related indexes/foreign keys. It does not alter existing tables, functions, views, triggers, privileges on existing objects, or rows. The first table enables revocable sessions; the second persists counters across instances; the third enables reporting/moderation without bypassing the review trigger or deleting history. All three revoke public privileges.

The migration was reviewed against live baseline metadata and applied explicitly during implementation. Its runner uses one transaction and refuses a partial installation. It is not run automatically by application startup/build. The reference SQL remains for disposable test databases only.

## Deferred product policy

Complaint/evidence retention, data-subject deletion, account recovery, additional administrator provisioning, public-content appeal/restoration policy, and external provider operational ownership still need decisions before a real-user launch. These were not confirmed in the supplied requirements. No private complaint access for administrators was assumed.
