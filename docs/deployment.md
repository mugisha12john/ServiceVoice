# Deploying ServiceVoice

The recommended path for the current implementation is a paid Render Node web service with a persistent disk. It keeps Gmail SMTP and the existing 10 MiB private attachment flow. Vercel requires changes to attachment transfers before supporting that allowance.

## What file storage means

Neon stores users, services, complaint discussions, and attachment metadata. Evidence images and documents need a separate private folder or object bucket. Users download them through the application's authorization checks.

On your development machine, `.env.local` now uses `STORAGE_DRIVER=local` and `PRIVATE_UPLOAD_DIR=.private-uploads`. The folder is outside `public/`, has restricted permissions, and is ignored by version control. Restart the development server after changing environment settings.

## Render

1. Connect your application repository and create a **Node Web Service**. Use Node.js 22 or newer. This application uses server sessions and API routes; choose the web service option described in [Render's Next.js guide](https://render.com/docs/deploy-nextjs-app).
2. Set the build command to `npm ci && npm run build` and start command to `npm start`.
3. Choose paid compute if keeping Gmail SMTP. [Render's free tier](https://render.com/docs/free#other-limitations) blocks outbound ports 25, 465, and 587. Using free compute would require a separate HTTPS email-provider integration; the current mail adapter uses SMTP.
4. Add a [persistent disk](https://render.com/docs/disks) mounted at `/var/data`. Set `STORAGE_DRIVER=local` and `PRIVATE_UPLOAD_DIR=/var/data/servicevoice-uploads`. Only files under the mount survive redeploys. Keep one service instance with this storage mode and arrange file backups independently of Neon.
5. Add the server environment settings below in Render's environment dashboard. Never upload `.env.local` to a repository.
6. Deploy, then confirm login, email verification, complaint upload, and authorized download. Check a file still downloads after a redeploy.

| Setting               | Value or source                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| `NODE_ENV`            | `production`                                                                 |
| `DATABASE_URL`        | Existing Neon pooled URL, with `sslmode=verify-full`                         |
| `AUTH_SECRET`         | A private random value of at least 32 characters; keep stable across deploys |
| `CRON_SECRET`         | A separate private random value of at least 32 characters                    |
| `AUTH_URL`, `APP_URL` | The same deployed HTTPS origin, such as `https://your-service.onrender.com`  |
| `SMTP_HOST`           | `smtp.gmail.com`                                                             |
| `SMTP_PORT`           | `587`                                                                        |
| `SMTP_SECURE`         | `false`                                                                      |
| `SMTP_REQUIRE_TLS`    | `true`                                                                       |
| `SMTP_USER`           | Your sending Gmail address                                                   |
| `SMTP_PASSWORD`       | Your current Google app password, entered privately                          |
| `EMAIL_FROM`          | A sender name and the authenticated Gmail address                            |
| `STORAGE_DRIVER`      | `local`                                                                      |
| `PRIVATE_UPLOAD_DIR`  | `/var/data/servicevoice-uploads`                                             |

Keep `AUTH_TRUST_HOST=false` unless you have confirmed that the deployment proxy overwrites forwarded host headers. The configured canonical auth/application URLs must agree.

The existing Neon installation already has migration 001. For a different database, inspect it and explicitly review/run `npm run db:migrate` from a trusted local operator terminal pointing at that target. Never recreate the application schema as part of a deployment. The first administrator already exists in the current database; use that account, rather than running bootstrap during builds.

### Notifications and overdue checks

Create a separate [Render Cron Job](https://render.com/docs/cronjobs) from the repository. Use Node.js 22 or newer, schedule `*/5 * * * *` (UTC), and command:

```bash
node deployment/run-maintenance.mjs
```

The runner uses only built-in Node APIs, so its build step can be `node --version`. Set `APP_URL` to the deployed web service's HTTPS origin and `CRON_SECRET` to the exact secret configured on that web service. Do not place a secret in the command or URL. No database or SMTP credentials are required by the cron job; it calls the authenticated worker on the web service. An external HTTP scheduler with protected header storage can call the same endpoint instead.

Running maintenance can send pending notification emails. The runner reports only whether the HTTP operation succeeded. Inspect worker/outbox status for retries and exhausted tasks; an accepted request does not establish email delivery. Scheduling has not been provisioned automatically.

## Vercel

Use the Next.js framework preset, Node.js 22 or newer, `npm run build`, the existing Neon pooled database URL, and the server environment variables above. Replace disk storage with `STORAGE_DRIVER=s3` and configure a private S3-compatible bucket using `.env.example`'s `STORAGE_*` fields. Local filesystem storage does not provide durable evidence storage here.

**Attachment limitation:** [Vercel Functions limit request and response payloads to 4.5 MB](https://vercel.com/docs/functions/limitations#request-body-size). This application currently transfers files through its authorized server endpoints and allows 10 MiB. Both large uploads and downloads therefore need a different transfer design before deploying the full workflow on Vercel. That would use authorized, short-lived object-store transfers, with server validation and controlled finalization. Setting S3 credentials alone does not remove this limitation. No such transfer redesign has been applied in this configuration fix.

The optional `deployment/vercel.example.json` schedules the existing worker every five minutes on a supporting plan. Check the [current cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing); otherwise use an external scheduler with a protected bearer header. `CRON_SECRET` must match the application's setting. Set `AUTH_URL` and `APP_URL` to the canonical deployment URL, and use separate databases and storage for previews.

## Details still needed before deployment

- Your final host and plan, and the resulting HTTPS application URL.
- For Render disk storage: provision the disk and backup process. No S3 keys are needed for this option.
- For S3 storage: the private bucket name, region, optional endpoint, and dedicated object credentials, entered directly in the host's environment settings.
- A scheduled job, plus an actual email verification and evidence upload/download check on the deployed application.

Do not send passwords or provider keys in chat. Configure them locally or in the hosting dashboard.
