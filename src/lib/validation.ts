import { z } from "zod";
export const uuid = z.uuid();
export const username = z
  .string()
  .trim()
  .min(2, "Use at least two characters.")
  .max(80)
  .regex(
    /^[\p{L}\p{N}_. -]+$/u,
    "Use letters, numbers, spaces, dots, underscores, or hyphens.",
  );
export const password = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(72, "Use no more than 72 characters.")
  .refine(
    (v) => new TextEncoder().encode(v).length <= 72,
    "Password must fit within 72 UTF-8 bytes.",
  );
export const email = z.email().trim().toLowerCase().max(254);
export const registerInput = z.object({ username, email, password });
export const loginInput = z.object({
  email,
  password: z.string().min(1).max(256),
});
export const verificationInput = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the six-digit code."),
});
export const reviewInput = z.object({
  stars: z.coerce.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .min(10, "Describe your experience in at least 10 characters.")
    .max(10000),
});
export const bodyInput = z.object({
  body: z.string().trim().min(2).max(10000),
});
export const descriptionInput = z.object({
  description: z
    .string()
    .trim()
    .min(20, "Please provide at least 20 characters.")
    .max(20000),
});
export const profileInput = z.object({
  username,
  profilePictureUrl: z
    .union([
      z.literal(""),
      z
        .url()
        .refine((v) => v.startsWith("https://"), "Use an HTTPS image URL."),
    ])
    .optional(),
});
export const organizationInput = z.object({
  name: z.string().trim().min(2).max(200),
  sector: z.string().trim().min(2).max(100),
  organizationType: z.enum(["PRIVATE", "GOVERNMENT"]),
  canAssess: z.boolean().default(false),
  description: z.string().trim().max(10000).default(""),
  contactEmail: z.union([z.literal(""), email]).default(""),
  contactPhone: z.string().max(40).default(""),
  address: z.string().max(1000).default(""),
  isActive: z.boolean().default(true),
});
export const organizationProfileInput = organizationInput.omit({
  organizationType: true,
  canAssess: true,
  isActive: true,
});
export const serviceInput = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(10000).default(""),
  isActive: z.boolean().default(true),
});
export const membershipInput = z.object({
  userId: uuid,
  organizationId: uuid,
  role: z.enum(["REPRESENTATIVE", "ASSESSOR"]),
});
export const assignmentInput = z.object({
  organizationId: uuid,
  authorityId: uuid,
});
export const reportInput = z.object({
  reason: z.string().trim().min(10).max(2000),
});
