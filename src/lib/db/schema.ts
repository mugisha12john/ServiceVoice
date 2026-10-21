import {
  pgSchema,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  smallint,
  bigint,
  numeric,
} from "drizzle-orm/pg-core";

export const feedback = pgSchema("company_feedback");
const id = () => uuid("id").primaryKey().defaultRandom();
const time = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
const created = () => time("created_at").notNull().defaultNow();
const updated = () => time("updated_at").notNull().defaultNow();

export const users = feedback.table("users", {
  id: id(),
  username: varchar("username", { length: 80 }).notNull(),
  email: varchar("email", { length: 254 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  profilePictureUrl: text("profile_picture_url"),
  emailVerifiedAt: time("email_verified_at"),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});
export const verificationCodes = feedback.table("email_verification_codes", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  codeHash: text("code_hash").notNull(),
  expiresAt: time("expires_at").notNull(),
  consumedAt: time("consumed_at"),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  createdAt: created(),
});
export const organizations = feedback.table("organizations", {
  id: id(),
  name: varchar("name", { length: 200 }).notNull(),
  sector: varchar("sector", { length: 100 }).notNull(),
  organizationType: varchar("organization_type", { length: 20 }).notNull(),
  canAssess: boolean("can_assess").notNull().default(false),
  description: text("description"),
  contactEmail: varchar("contact_email", { length: 254 }),
  contactPhone: varchar("contact_phone", { length: 40 }),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});
export const memberships = feedback.table("memberships", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  role: varchar("role", { length: 20 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
});
export const assignments = feedback.table("assessor_assignments", {
  id: id(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  authorityId: uuid("authority_id")
    .notNull()
    .references(() => organizations.id),
  assignedBy: uuid("assigned_by")
    .notNull()
    .references(() => users.id),
  assignedAt: time("assigned_at").notNull().defaultNow(),
  endedAt: time("ended_at"),
});
export const services = feedback.table("services", {
  id: id(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});
export const reviews = feedback.table("reviews", {
  id: id(),
  consumerId: uuid("consumer_id")
    .notNull()
    .references(() => users.id),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id),
  stars: smallint("stars").notNull(),
  comment: text("comment").notNull(),
  createdAt: created(),
  updatedAt: updated(),
  deletedAt: time("deleted_at"),
});
export const replies = feedback.table("review_replies", {
  id: id(),
  reviewId: uuid("review_id")
    .notNull()
    .references(() => reviews.id),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: created(),
  updatedAt: updated(),
});
export const complaints = feedback.table("complaints", {
  id: id(),
  referenceNumber: bigint("reference_number", {
    mode: "bigint",
  }).generatedAlwaysAsIdentity(),
  consumerId: uuid("consumer_id")
    .notNull()
    .references(() => users.id),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id),
  assignmentId: uuid("assignment_id")
    .notNull()
    .references(() => assignments.id),
  description: text("description").notNull(),
  status: varchar("status", { length: 10 }).notNull().default("PENDING"),
  submittedAt: time("submitted_at").notNull().defaultNow(),
  responseDueAt: time("response_due_at").notNull(),
  firstResponseAt: time("first_response_at"),
  resolvedAt: time("resolved_at"),
});
export const messages = feedback.table("complaint_messages", {
  id: id(),
  complaintId: uuid("complaint_id")
    .notNull()
    .references(() => complaints.id),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: created(),
});
export const attachments = feedback.table("complaint_attachments", {
  id: id(),
  complaintId: uuid("complaint_id")
    .notNull()
    .references(() => complaints.id),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  originalFilename: varchar("original_filename", { length: 255 }).notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: varchar("mime_type", { length: 150 }).notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  createdAt: created(),
});
export const proposals = feedback.table("resolution_proposals", {
  id: id(),
  complaintId: uuid("complaint_id")
    .notNull()
    .references(() => complaints.id),
  proposedBy: uuid("proposed_by")
    .notNull()
    .references(() => users.id),
  description: text("description").notNull(),
  proposedAt: time("proposed_at").notNull().defaultNow(),
  confirmedBy: uuid("confirmed_by").references(() => users.id),
  confirmedAt: time("confirmed_at"),
});
export const outbox = feedback.table("notification_outbox", {
  id: id(),
  complaintId: uuid("complaint_id")
    .notNull()
    .references(() => complaints.id),
  recipientOrganizationId: uuid("recipient_organization_id")
    .notNull()
    .references(() => organizations.id),
  recipientRole: varchar("recipient_role", { length: 20 }).notNull(),
  eventType: varchar("event_type", { length: 30 }).notNull(),
  createdAt: created(),
  deliveredAt: time("delivered_at"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
});
// Existing views are mapped for reads; the application never creates or replaces them.
export const publicReviews = feedback
  .view("public_reviews", {
    id: uuid("id"),
    serviceId: uuid("service_id"),
    consumerId: uuid("consumer_id"),
    username: varchar("username", { length: 80 }),
    profilePictureUrl: text("profile_picture_url"),
    stars: smallint("stars"),
    comment: text("comment"),
    createdAt: time("created_at"),
    updatedAt: time("updated_at"),
  })
  .existing();
export const latestConsumerRatings = feedback
  .view("latest_consumer_ratings", {
    reviewId: uuid("review_id"),
    serviceId: uuid("service_id"),
    consumerId: uuid("consumer_id"),
    stars: smallint("stars"),
    createdAt: time("created_at"),
  })
  .existing();
export const serviceRatingSummary = feedback
  .view("service_rating_summary", {
    serviceId: uuid("service_id"),
    organizationId: uuid("organization_id"),
    name: varchar("name", { length: 200 }),
    reviewerCount: bigint("reviewer_count", { mode: "number" }),
    averageRating: numeric("average_rating"),
  })
  .existing();
