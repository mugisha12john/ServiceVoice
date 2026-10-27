# REST API v1

All application endpoints use `/api/v1`. JSON is returned with `private, no-store`. Mutations require an `Origin` equal to the configured canonical `APP_URL`. Browser authentication uses HttpOnly cookies managed by Auth.js. Errors have `{ "error": "readable message", "fields": [{ "path": "field", "message": "reason" }] }` where field errors apply. Never submit ownership, author, privilege, or route-assignment IDs; they are derived server-side. Unknown fields are stripped by validation.

## Accounts

| Method    | Path                        | Purpose                                                         |
| --------- | --------------------------- | --------------------------------------------------------------- |
| POST      | `/auth/register`            | `{username,email,password}`; consumer only                      |
| POST      | `/auth/login`               | `{email,password}`; creates cookie and revocable server session |
| POST      | `/auth/logout`              | Revokes current session                                         |
| POST      | `/auth/resend-verification` | Authenticated user requests email code                          |
| POST      | `/auth/verify-email`        | `{code}`; current authenticated user only                       |
| GET/PATCH | `/me`                       | Current profile/roles; patch `{username,profilePictureUrl}`     |

Auth.js internal endpoints live at `/auth/session/*`. Password hashes and live verification codes never appear in responses.

## Public directory and reviews

| Method       | Path                                        | Access                                                          |
| ------------ | ------------------------------------------- | --------------------------------------------------------------- |
| GET          | `/organizations?q=&sector=&type=&page=`     | Public; 12 results/page                                         |
| GET          | `/organizations/{id}`                       | Public active organization                                      |
| PATCH        | `/organizations/{id}`                       | Its representative; public profile fields                       |
| GET/POST     | `/organizations/{id}/services`              | Public list / its representative creates                        |
| GET/PATCH    | `/services/{id}`                            | Public active service / its representative edits or deactivates |
| GET          | `/services/{id}/reviews?page=&sort=&stars=` | Public; 20/page; sort recent/highest/lowest                     |
| POST         | `/services/{id}/reviews`                    | Verified consumer; `{stars,comment}`                            |
| PATCH/DELETE | `/reviews/{id}`                             | Verified owner edits / owner soft-deletes                       |
| POST         | `/reviews/{id}/replies`                     | Its organization representative; `{body}`                       |
| POST         | `/reviews/{id}/report`                      | Verified user; `{reason}`                                       |
| POST         | `/review-replies/{id}/report`               | Verified user; `{reason}`                                       |

Each public review's `replies` contains `{id,body,organization_name,created_at}`. The organization name is derived from the reviewed service, rather than a supplied identity or the representative's personal username. The reviewer's own public `username` remains on the review. Stored reply author IDs are retained internally.

## Private complaints

| Method | Path                                          | Access                                                                                                            |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| POST   | `/services/{id}/complaints`                   | Verified consumer; `{description}`                                                                                |
| GET    | `/complaints?scope=&filter=&page=`            | Only permitted complaints, 50/page; scope consumer/organization/assessor/all, filter all/pending/resolved/overdue |
| GET    | `/complaints/{id}`                            | Participant only; details, discussion, evidence metadata, proposals                                               |
| POST   | `/complaints/{id}/messages`                   | Participant; `{body}`, Pending only                                                                               |
| POST   | `/complaints/{id}/attachments`                | Participant; multipart `file`                                                                                     |
| GET    | `/complaints/{id}/attachments/{attachmentId}` | Participant; private download                                                                                     |
| POST   | `/complaints/{id}/resolution-proposals`       | Organization representative; `{description}`                                                                      |
| POST   | `/resolution-proposals/{id}/confirm`          | Verified submitting consumer only                                                                                 |

There is no generic status-update endpoint. Replies/proposals never set `RESOLVED`; the existing confirmation trigger does so atomically. Private reads intentionally return a generic 404 when an authenticated user is not a participant. Administrator privilege alone does not grant access.

## Administration

| Method     | Path                               | Purpose                                                                          |
| ---------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| GET        | `/admin`                           | Public-registry/account/moderation administration; no private complaint contents |
| POST/PATCH | `/admin/organizations[/{id}]`      | Registration/profile/access; status-only patch preserves all other fields        |
| POST       | `/admin/staff-accounts`            | `{username,email,password}`; unverified account, no automatic membership         |
| POST       | `/admin/memberships`               | `{userId,organizationId,role}`; REPRESENTATIVE or ASSESSOR                       |
| PATCH      | `/admin/memberships/{id}`          | `{isActive}`                                                                     |
| POST       | `/admin/assessor-assignments`      | `{organizationId,authorityId}`; ends old current assignment atomically           |
| PATCH      | `/admin/assessor-assignments/{id}` | Ends the assignment for new reports                                              |
| PATCH      | `/admin/users/{id}`                | `{isActive}`; excludes administrator accounts and self-disable                   |
| PATCH      | `/admin/reports/{id}`              | `{status: HIDDEN or DISMISSED,note}`; audit reason required                      |

## Worker

`GET` or `POST /jobs/maintenance` requires `Authorization: Bearer <CRON_SECRET>` rather than a user session. It returns queue/delivery/failure counts. Missing SMTP returns `email: "not configured"` and never claims delivery. See README for scheduling and retry semantics.
