-- Company Service Evaluation and Complaint Management System
-- Initial PostgreSQL migration for Neon. Run the WHOLE file once.
-- Creates a separate schema; does not drop or replace existing tables.
-- If company_feedback already exists, stop and use a versioned migration.
--
-- IMPLEMENTATION ASSUMPTIONS:
-- * Rating window: rolling 3 calendar months, calculated in UTC.
-- * Response deadline: 72 elapsed hours from submission.
-- * Latest rating: newest creation time, not last edit time.
-- * Deleting the latest review reveals the newest remaining active review.
-- * Service averages use the latest active rating per consumer across all time.
--
-- APPLICATION RESPONSIBILITIES:
-- Keep the database URL on the backend; never put it in browser code.
-- This schema does NOT provide end-user authentication or row-level security.
-- Authenticate users and enforce SELECT/UPDATE/DELETE authorization in the API.
-- Never trust consumer_id / author_id / confirmed_by from request bodies.
-- Derive those IDs from the authenticated session. Database owners can bypass
-- business workflows; use a dedicated restricted backend DB role in deployment.
-- Password hashing, code delivery/validation, upload storage, moderation,
-- notification delivery and scheduled jobs require backend implementation.
-- Email verification proves mailbox access, not service consumption.
--
-- No sample accounts, plaintext passwords, real authorities or awards are seeded.

BEGIN;
SET LOCAL TIME ZONE 'UTC';

CREATE SCHEMA company_feedback;
REVOKE ALL ON SCHEMA company_feedback FROM PUBLIC;
SET LOCAL search_path = company_feedback, pg_catalog;

-- 1. Accounts ---------------------------------------------------------------
CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username varchar(80) NOT NULL CHECK (length(btrim(username)) > 0),
    email varchar(254) NOT NULL CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1),
    password_hash text NOT NULL CHECK (length(password_hash) > 0),
    profile_picture_url text,
    email_verified_at timestamptz,
    is_super_admin boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE UNIQUE INDEX users_email_unique ON users (email);
CREATE UNIQUE INDEX users_username_unique ON users (lower(username));

CREATE TABLE email_verification_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    CHECK (expires_at > created_at),
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
CREATE INDEX verification_user_idx ON email_verification_codes(user_id, created_at DESC);

-- 2. Organizations and staff ------------------------------------------------
CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
    sector varchar(100) NOT NULL,
    organization_type varchar(20) NOT NULL CHECK (organization_type IN ('PRIVATE', 'GOVERNMENT')),
    can_assess boolean NOT NULL DEFAULT false,
    description text,
    contact_email varchar(254),
    contact_phone varchar(40),
    address text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    role varchar(20) NOT NULL CHECK (role IN ('REPRESENTATIVE', 'ASSESSOR')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    UNIQUE (user_id, organization_id, role)
);
CREATE INDEX memberships_org_idx ON memberships(organization_id, role) WHERE is_active;

CREATE TABLE assessor_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    authority_id uuid NOT NULL REFERENCES organizations(id),
    assigned_by uuid NOT NULL REFERENCES users(id),
    assigned_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    ended_at timestamptz,
    CHECK (organization_id <> authority_id),
    CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);
CREATE UNIQUE INDEX one_active_assessor_per_org
    ON assessor_assignments(organization_id) WHERE ended_at IS NULL;
CREATE INDEX assignments_authority_idx ON assessor_assignments(authority_id);

-- Preserve old assignments when changing assessors: end the old row, add a row.
-- Existing complaints keep their original assignment; rerouting needs an
-- explicit future workflow and is not silently applied by this migration.
CREATE FUNCTION validate_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path = company_feedback, pg_catalog AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND
       (NEW.organization_id, NEW.authority_id, NEW.assigned_by, NEW.assigned_at)
       IS DISTINCT FROM
       (OLD.organization_id, OLD.authority_id, OLD.assigned_by, OLD.assigned_at) THEN
        RAISE EXCEPTION 'End the assignment and insert a new assignment instead';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.assigned_by AND is_super_admin AND is_active) THEN
            RAISE EXCEPTION 'Assignment must name an active super administrator';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = NEW.authority_id AND can_assess AND is_active) THEN
            RAISE EXCEPTION 'Authority must be an active assessing organization';
        END IF;
        NEW.assigned_at := statement_timestamp();
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER assignment_validation BEFORE INSERT OR UPDATE ON assessor_assignments
FOR EACH ROW EXECUTE FUNCTION validate_assignment();

CREATE TABLE services (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id),
    name varchar(200) NOT NULL CHECK (length(btrim(name)) > 0),
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX services_org_idx ON services(organization_id);

-- 3. Public reviews ---------------------------------------------------------
CREATE TABLE reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id uuid NOT NULL REFERENCES users(id),
    service_id uuid NOT NULL REFERENCES services(id),
    stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
    comment text NOT NULL CHECK (length(btrim(comment)) > 0),
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    deleted_at timestamptz
);
CREATE INDEX reviews_latest_idx ON reviews(service_id, consumer_id, created_at DESC, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX reviews_consumer_idx ON reviews(consumer_id, service_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- Serialize review writes for each consumer to prevent simultaneous inserts
-- from exceeding the allowance. Use normal READ COMMITTED transactions.
CREATE FUNCTION enforce_review_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path = company_feedback, pg_catalog AS $$
DECLARE
    v_verified timestamptz;
    v_active boolean;
    v_count integer;
BEGIN
    SELECT email_verified_at, is_active INTO v_verified, v_active
    FROM users WHERE id = NEW.consumer_id FOR UPDATE;
    IF NOT FOUND OR NOT v_active OR v_verified IS NULL THEN
        RAISE EXCEPTION 'An active email-verified consumer is required';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NOT EXISTS (
            SELECT 1 FROM services s JOIN organizations o ON o.id = s.organization_id
            WHERE s.id = NEW.service_id AND s.is_active AND o.is_active
        ) THEN
            RAISE EXCEPTION 'Service is not active';
        END IF;
        NEW.created_at := statement_timestamp();
        NEW.updated_at := NEW.created_at;
        NEW.deleted_at := NULL;
        SELECT count(*) INTO v_count FROM reviews
        WHERE consumer_id = NEW.consumer_id AND service_id = NEW.service_id
          AND deleted_at IS NULL
          AND created_at > ((NEW.created_at AT TIME ZONE 'UTC') - interval '3 months') AT TIME ZONE 'UTC';
        IF v_count >= 2 THEN
            RAISE EXCEPTION 'Maximum two active reviews per service in a rolling three-month period';
        END IF;
    ELSE
        IF (NEW.id, NEW.consumer_id, NEW.service_id, NEW.created_at)
           IS DISTINCT FROM (OLD.id, OLD.consumer_id, OLD.service_id, OLD.created_at) THEN
            RAISE EXCEPTION 'Review identity, ownership, service and creation time cannot change';
        END IF;
        IF OLD.deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'A deleted review cannot be edited or restored; create a new review';
        END IF;
        IF NEW.deleted_at IS NOT NULL THEN
            NEW.deleted_at := statement_timestamp();
        END IF;
        NEW.updated_at := statement_timestamp();
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER review_rules BEFORE INSERT OR UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION enforce_review_rules();

CREATE TABLE review_replies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id uuid NOT NULL REFERENCES reviews(id),
    author_id uuid NOT NULL REFERENCES users(id),
    body text NOT NULL CHECK (length(btrim(body)) > 0),
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX review_replies_review_idx ON review_replies(review_id);

CREATE FUNCTION validate_review_reply() RETURNS trigger
LANGUAGE plpgsql SET search_path = company_feedback, pg_catalog AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND (NEW.id, NEW.review_id, NEW.author_id, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.review_id, OLD.author_id, OLD.created_at) THEN
        RAISE EXCEPTION 'Reply ownership and identity cannot change';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM reviews r
        JOIN services s ON s.id = r.service_id
        JOIN memberships m ON m.organization_id = s.organization_id
        JOIN users u ON u.id = m.user_id
        WHERE r.id = NEW.review_id AND r.deleted_at IS NULL
          AND m.user_id = NEW.author_id AND m.role = 'REPRESENTATIVE'
          AND m.is_active AND u.is_active
    ) THEN
        RAISE EXCEPTION 'Reply author must represent the reviewed organization';
    END IF;
    NEW.updated_at := statement_timestamp();
    RETURN NEW;
END;
$$;
CREATE TRIGGER review_reply_validation BEFORE INSERT OR UPDATE ON review_replies
FOR EACH ROW EXECUTE FUNCTION validate_review_reply();

-- The public view deliberately omits email and password hashes.
CREATE VIEW public_reviews AS
SELECT r.id, r.service_id, r.consumer_id, u.username, u.profile_picture_url,
       r.stars, r.comment, r.created_at, r.updated_at
FROM reviews r JOIN users u ON u.id = r.consumer_id
WHERE r.deleted_at IS NULL;

CREATE VIEW latest_consumer_ratings AS
SELECT DISTINCT ON (service_id, consumer_id)
       id AS review_id, service_id, consumer_id, stars, created_at
FROM reviews WHERE deleted_at IS NULL
ORDER BY service_id, consumer_id, created_at DESC, id DESC;

CREATE VIEW service_rating_summary AS
SELECT s.id AS service_id, s.organization_id, s.name,
       count(r.review_id) AS reviewer_count,
       round(avg(r.stars), 2) AS average_rating
FROM services s LEFT JOIN latest_consumer_ratings r ON r.service_id = s.id
GROUP BY s.id, s.organization_id, s.name;
-- No ratings produces reviewer_count = 0 and average_rating = NULL, not zero stars.

-- 4. Private complaints -----------------------------------------------------
CREATE TABLE complaints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    consumer_id uuid NOT NULL REFERENCES users(id),
    service_id uuid NOT NULL REFERENCES services(id),
    assignment_id uuid NOT NULL REFERENCES assessor_assignments(id),
    description text NOT NULL CHECK (length(btrim(description)) > 0),
    status varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED')),
    submitted_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    response_due_at timestamptz NOT NULL DEFAULT (statement_timestamp() + interval '72 hours'),
    first_response_at timestamptz,
    resolved_at timestamptz,
    CHECK (response_due_at > submitted_at),
    CHECK (first_response_at IS NULL OR first_response_at >= submitted_at),
    CHECK ((status = 'PENDING' AND resolved_at IS NULL)
        OR (status = 'RESOLVED' AND resolved_at IS NOT NULL AND resolved_at >= submitted_at))
);
CREATE INDEX complaints_consumer_idx ON complaints(consumer_id, submitted_at DESC);
CREATE INDEX complaints_service_idx ON complaints(service_id);
CREATE INDEX complaints_assignment_idx ON complaints(assignment_id);
CREATE INDEX complaints_unanswered_idx ON complaints(response_due_at)
    WHERE first_response_at IS NULL AND status = 'PENDING';

CREATE TABLE complaint_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id uuid NOT NULL REFERENCES complaints(id),
    author_id uuid NOT NULL REFERENCES users(id),
    body text NOT NULL CHECK (length(btrim(body)) > 0),
    created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX complaint_messages_parent_idx ON complaint_messages(complaint_id, created_at);

CREATE TABLE complaint_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id uuid NOT NULL REFERENCES complaints(id),
    uploaded_by uuid NOT NULL REFERENCES users(id),
    original_filename varchar(255) NOT NULL,
    storage_key text NOT NULL UNIQUE,
    mime_type varchar(150) NOT NULL,
    size_bytes bigint NOT NULL CHECK (size_bytes > 0),
    created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX complaint_attachments_parent_idx ON complaint_attachments(complaint_id);

CREATE TABLE resolution_proposals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id uuid NOT NULL REFERENCES complaints(id),
    proposed_by uuid NOT NULL REFERENCES users(id),
    description text NOT NULL CHECK (length(btrim(description)) > 0),
    proposed_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    confirmed_by uuid REFERENCES users(id),
    confirmed_at timestamptz,
    CHECK ((confirmed_by IS NULL) = (confirmed_at IS NULL))
);
CREATE INDEX resolution_proposals_parent_idx ON resolution_proposals(complaint_id);
CREATE UNIQUE INDEX one_confirmed_resolution ON resolution_proposals(complaint_id)
    WHERE confirmed_at IS NOT NULL;

-- Outbox rows are tasks, NOT proof that an email was delivered.
-- Backend workers send messages, retry failures and set delivered_at.
CREATE TABLE notification_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id uuid NOT NULL REFERENCES complaints(id),
    recipient_organization_id uuid NOT NULL REFERENCES organizations(id),
    recipient_role varchar(20) NOT NULL CHECK (recipient_role IN ('REPRESENTATIVE', 'ASSESSOR')),
    event_type varchar(30) NOT NULL CHECK (event_type IN ('REPORT_SUBMITTED', 'RESPONSE_OVERDUE')),
    created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
    delivered_at timestamptz,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error text,
    UNIQUE (complaint_id, recipient_organization_id, recipient_role, event_type)
);
CREATE INDEX outbox_pending_idx ON notification_outbox(created_at) WHERE delivered_at IS NULL;

CREATE FUNCTION prepare_complaint() RETURNS trigger
LANGUAGE plpgsql SET search_path = company_feedback, pg_catalog AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.consumer_id AND is_active AND email_verified_at IS NOT NULL) THEN
        RAISE EXCEPTION 'An active email-verified consumer is required';
    END IF;
    -- Select the authority from the service owner; ignore client-supplied assignment.
    SELECT a.id INTO NEW.assignment_id
    FROM services s JOIN organizations o ON o.id = s.organization_id
    JOIN assessor_assignments a ON a.organization_id = o.id AND a.ended_at IS NULL
    JOIN organizations authority ON authority.id = a.authority_id
    WHERE s.id = NEW.service_id AND s.is_active AND o.is_active
      AND authority.can_assess AND authority.is_active
    FOR SHARE OF a;
    IF NEW.assignment_id IS NULL THEN
        RAISE EXCEPTION 'Service must be active and its organization must have an active assessor';
    END IF;
    NEW.submitted_at := statement_timestamp();
    NEW.response_due_at := NEW.submitted_at + interval '72 hours';
    NEW.first_response_at := NULL;
    NEW.status := 'PENDING';
    NEW.resolved_at := NULL;
    RETURN NEW;
END;
$$;
CREATE TRIGGER complaint_preparation BEFORE INSERT ON complaints
FOR EACH ROW EXECUTE FUNCTION prepare_complaint();

CREATE FUNCTION queue_new_complaint() RETURNS trigger
LANGUAGE plpgsql SET search_path = company_feedback, pg_catalog AS $$
BEGIN
    INSERT INTO notification_outbox(complaint_id, recipient_organization_id, recipient_role, event_type)
    SELECT NEW.id, s.organization_id, 'REPRESENTATIVE', 'REPORT_SUBMITTED'
    FROM services s WHERE s.id = NEW.service_id;
    INSERT INTO notification_outbox(complaint_id, recipient_organization_id, recipient_role, event_type)
    SELECT NEW.id, a.authority_id, 'ASSESSOR', 'REPORT_SUBMITTED'
    FROM assessor_assignments a WHERE a.id = NEW.assignment_id;
    RETURN NEW;
END;
$$;
CREATE TRIGGER complaint_notifications AFTER INSERT ON complaints
FOR EACH ROW EXECUTE FUNCTION queue_new_complaint();

CREATE FUNCTION is_org_representative(p_user uuid, p_org uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = company_feedback, pg_catalog AS $$
    SELECT EXISTS (
        SELECT 1 FROM memberships m JOIN users u ON u.id = m.user_id
        WHERE m.user_id = p_user AND m.organization_id = p_org
          AND m.role = 'REPRESENTATIVE' AND m.is_active AND u.is_active
    );
$$;

CREATE FUNCTION is_complaint_participant(p_user uuid, p_complaint uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = company_feedback, pg_catalog AS $$
    SELECT EXISTS (
        SELECT 1 FROM complaints c
        JOIN services s ON s.id = c.service_id
        JOIN assessor_assignments a ON a.id = c.assignment_id
        JOIN users u ON u.id = p_user AND u.is_active
        WHERE c.id = p_complaint AND (
            c.consumer_id = p_user
            OR is_org_representative(p_user, s.organization_id)
            OR EXISTS (
                SELECT 1 FROM memberships m WHERE m.user_id = p_user
                AND m.organization_id = a.authority_id AND m.role = 'ASSESSOR' AND m.is_active
            )
        )
    );
$$;
-- The API must call permission checks for reads as well as writes.
-- Super-admin complaint-content access is intentionally not included here.

CREATE FUNCTION validate_complaint_message() RETURNS trigger
LANGUAGE plpgsql SET search_path = company_feedback, pg_catalog AS $$
DECLARE v_org uuid; v_status text;
BEGIN
    SELECT s.organization_id, c.status INTO v_org, v_status
    FROM complaints c JOIN services s ON s.id = c.service_id
    WHERE c.id = NEW.complaint_id FOR UPDATE OF c;
    IF NOT FOUND OR v_status <> 'PENDING' THEN
        RAISE EXCEPTION 'Complaint must exist and be pending';
    END IF;
    IF NOT is_complaint_participant(NEW.author_id, NEW.complaint_id) THEN
        RAISE EXCEPTION 'Author cannot participate in this complaint';
    END IF;
    NEW.created_at := statement_timestamp();
    IF is_org_representative(NEW.author_id, v_org) THEN
        UPDATE complaints SET first_response_at = coalesce(first_response_at, NEW.created_at)
        WHERE id = NEW.complaint_id;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER complaint_message_validation BEFORE INSERT ON complaint_messages
FOR EACH ROW EXECUTE FUNCTION validate_complaint_message();

CREATE FUNCTION validate_complaint_attachment() RETURNS trigger
LANGUAGE plpgsql SET search_path = company_feedback, pg_catalog AS $$
BEGIN
    IF NOT is_complaint_participant(NEW.uploaded_by, NEW.complaint_id) THEN
        RAISE EXCEPTION 'Uploader cannot participate in this complaint';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER complaint_attachment_validation BEFORE INSERT ON complaint_attachments
FOR EACH ROW EXECUTE FUNCTION validate_complaint_attachment();

CREATE FUNCTION validate_resolution_proposal() RETURNS trigger
LANGUAGE plpgsql SET search_path = company_feedback, pg_catalog AS $$
DECLARE v_consumer uuid; v_org uuid; v_status text;
BEGIN
    SELECT c.consumer_id, s.organization_id, c.status
    INTO v_consumer, v_org, v_status
    FROM complaints c JOIN services s ON s.id = c.service_id
    WHERE c.id = NEW.complaint_id FOR UPDATE OF c;
    IF NOT FOUND OR v_status <> 'PENDING' THEN
        RAISE EXCEPTION 'Complaint must exist and be pending';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NOT is_org_representative(NEW.proposed_by, v_org) THEN
            RAISE EXCEPTION 'Only the organization can propose a resolution';
        END IF;
        NEW.proposed_at := statement_timestamp();
        NEW.confirmed_at := NULL;
        NEW.confirmed_by := NULL;
        UPDATE complaints SET first_response_at = coalesce(first_response_at, NEW.proposed_at)
        WHERE id = NEW.complaint_id;
    ELSE
        IF (NEW.id, NEW.complaint_id, NEW.proposed_by, NEW.description, NEW.proposed_at)
           IS DISTINCT FROM (OLD.id, OLD.complaint_id, OLD.proposed_by, OLD.description, OLD.proposed_at) THEN
            RAISE EXCEPTION 'Proposals are immutable; submit a new proposal';
        END IF;
        IF OLD.confirmed_at IS NOT NULL OR NEW.confirmed_by IS DISTINCT FROM v_consumer THEN
            RAISE EXCEPTION 'Only the complaint consumer can confirm an unconfirmed proposal';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM users WHERE id = v_consumer AND is_active AND email_verified_at IS NOT NULL) THEN
            RAISE EXCEPTION 'Consumer must be active and verified';
        END IF;
        NEW.confirmed_at := statement_timestamp();
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER resolution_validation BEFORE INSERT OR UPDATE ON resolution_proposals
FOR EACH ROW EXECUTE FUNCTION validate_resolution_proposal();

CREATE FUNCTION apply_confirmed_resolution() RETURNS trigger
LANGUAGE plpgsql SET search_path = company_feedback, pg_catalog AS $$
BEGIN
    IF OLD.confirmed_at IS NULL AND NEW.confirmed_at IS NOT NULL THEN
        UPDATE complaints SET status = 'RESOLVED', resolved_at = NEW.confirmed_at
        WHERE id = NEW.complaint_id;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER resolution_confirmation AFTER UPDATE ON resolution_proposals
FOR EACH ROW EXECUTE FUNCTION apply_confirmed_resolution();

CREATE FUNCTION protect_complaint_workflow() RETURNS trigger
LANGUAGE plpgsql SET search_path = company_feedback, pg_catalog AS $$
BEGIN
    IF (NEW.id, NEW.reference_number, NEW.consumer_id, NEW.service_id,
        NEW.assignment_id, NEW.submitted_at, NEW.response_due_at, NEW.description)
       IS DISTINCT FROM
       (OLD.id, OLD.reference_number, OLD.consumer_id, OLD.service_id,
        OLD.assignment_id, OLD.submitted_at, OLD.response_due_at, OLD.description) THEN
        RAISE EXCEPTION 'Complaint routing, ownership, description and deadlines are immutable';
    END IF;
    IF OLD.first_response_at IS NOT NULL AND NEW.first_response_at IS DISTINCT FROM OLD.first_response_at THEN
        RAISE EXCEPTION 'First response time cannot be changed after recording';
    END IF;
    IF (NEW.status, NEW.resolved_at) IS DISTINCT FROM (OLD.status, OLD.resolved_at) THEN
        IF OLD.status = 'RESOLVED' OR NEW.status <> 'RESOLVED' OR NOT EXISTS (
            SELECT 1 FROM resolution_proposals p
            WHERE p.complaint_id = NEW.id AND p.confirmed_by = NEW.consumer_id
              AND p.confirmed_at = NEW.resolved_at
        ) THEN
            RAISE EXCEPTION 'Resolution requires a consumer-confirmed proposal';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER complaint_workflow BEFORE UPDATE ON complaints
FOR EACH ROW EXECUTE FUNCTION protect_complaint_workflow();

-- Run from a backend scheduler, for example every 5 minutes.
-- This queues one overdue notification for each recipient group.
-- It does NOT send email and is not scheduled automatically by this script.
CREATE FUNCTION enqueue_overdue_complaints() RETURNS integer
LANGUAGE plpgsql SET search_path = company_feedback, pg_catalog AS $$
DECLARE v_count integer;
BEGIN
    INSERT INTO notification_outbox(complaint_id, recipient_organization_id, recipient_role, event_type)
    SELECT c.id, recipients.org_id, recipients.role, 'RESPONSE_OVERDUE'
    FROM complaints c
    JOIN services s ON s.id = c.service_id
    JOIN assessor_assignments a ON a.id = c.assignment_id
    CROSS JOIN LATERAL (
        VALUES (s.organization_id, 'REPRESENTATIVE'::varchar),
               (a.authority_id, 'ASSESSOR'::varchar)
    ) AS recipients(org_id, role)
    WHERE c.status = 'PENDING' AND c.first_response_at IS NULL
      AND c.response_due_at <= statement_timestamp()
    ON CONFLICT (complaint_id, recipient_organization_id, recipient_role, event_type) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- 5. General timestamps and ownership ---------------------------------------
CREATE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = company_feedback, pg_catalog AS $$
BEGIN
    NEW.updated_at := statement_timestamp();
    RETURN NEW;
END;
$$;
CREATE TRIGGER users_touch BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER organizations_touch BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER services_touch BEFORE UPDATE ON services
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Moving a service to another organization could expose complaints to the
-- wrong organization, so create a new service instead.
CREATE FUNCTION protect_service_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = company_feedback, pg_catalog AS $$
BEGIN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
        RAISE EXCEPTION 'A service cannot be transferred to another organization';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER service_owner_immutable BEFORE UPDATE ON services
FOR EACH ROW EXECUTE FUNCTION protect_service_owner();

-- No anonymous database privileges. The backend connects using a private DB role.
REVOKE ALL ON ALL TABLES IN SCHEMA company_feedback FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA company_feedback FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA company_feedback FROM PUBLIC;

COMMIT;

-- OPTIONAL READ-ONLY CHECKS AFTER SUCCESS:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'company_feedback' AND table_type = 'BASE TABLE'
-- ORDER BY table_name;
--
-- SELECT * FROM company_feedback.service_rating_summary;
--
-- COMMON BACKEND OPERATIONS (bind values using your database driver's parameters):
-- Soft-delete an owned review:
-- UPDATE company_feedback.reviews SET deleted_at = now()
-- WHERE id = $1 AND consumer_id = $2 AND deleted_at IS NULL;
--
-- Submit a report (assignment and deadline are filled by the trigger):
-- INSERT INTO company_feedback.complaints(consumer_id, service_id, description)
-- VALUES ($1, $2, $3) RETURNING id, reference_number, status, response_due_at;
--
-- Confirm a resolution (authenticate $2 as the actual complaint owner):
-- UPDATE company_feedback.resolution_proposals SET confirmed_by = $2
-- WHERE id = $1 AND confirmed_at IS NULL RETURNING *;
--
-- Scheduled follow-up:
-- SELECT company_feedback.enqueue_overdue_complaints();
