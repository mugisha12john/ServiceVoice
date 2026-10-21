-- ADDITIVE ONLY. Review before applying with psql -v ON_ERROR_STOP=1.
-- Leaves every existing table, function, view, trigger, and row unchanged.
BEGIN;
CREATE TABLE company_feedback.app_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES company_feedback.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX app_sessions_user_idx ON company_feedback.app_sessions(user_id);
CREATE INDEX app_sessions_expiry_idx ON company_feedback.app_sessions(expires_at);
-- Durable counters across processes and deployments. Keys are HMACs, not email/IP values.
CREATE TABLE company_feedback.security_rate_limits (
  key_hash text NOT NULL,
  bucket bigint NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (key_hash, bucket)
);
CREATE INDEX security_rate_limits_expiry_idx ON company_feedback.security_rate_limits(expires_at);
-- Reports and moderation are separate from review deletion. Hiding preserves
-- review history/allowance/rating calculations; it does not change SQL views.
CREATE TABLE company_feedback.public_content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid REFERENCES company_feedback.reviews(id),
  reply_id uuid REFERENCES company_feedback.review_replies(id),
  reported_by uuid NOT NULL REFERENCES company_feedback.users(id),
  reason text NOT NULL CHECK (length(btrim(reason)) >= 10),
  status varchar(12) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','DISMISSED','HIDDEN')),
  moderation_note text,
  reviewed_by uuid REFERENCES company_feedback.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  CHECK (num_nonnulls(review_id,reply_id) = 1),
  CHECK ((status = 'OPEN' AND reviewed_by IS NULL AND reviewed_at IS NULL) OR
         (status <> 'OPEN' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX public_content_reports_review_idx ON company_feedback.public_content_reports(review_id);
CREATE INDEX public_content_reports_reply_idx ON company_feedback.public_content_reports(reply_id);
CREATE INDEX public_content_reports_status_idx ON company_feedback.public_content_reports(status,created_at);
REVOKE ALL ON company_feedback.app_sessions, company_feedback.security_rate_limits, company_feedback.public_content_reports FROM PUBLIC;
COMMIT;
