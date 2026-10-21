import { describe, it, expect } from "vitest";
import { validateEvidence, MAX_FILE_BYTES } from "../src/lib/file-validation";
import {
  registerInput,
  reviewInput,
  organizationInput,
} from "../src/lib/validation";
import { publicError } from "../src/lib/errors";
import { reference } from "../src/lib/utils";
describe("Public inputs", () => {
  it("never grants staff privileges through signup", () => {
    const result = registerInput.parse({
      username: "consumer",
      email: "TEST@example.com",
      password: "a-good-passphrase",
      isSuperAdmin: true,
      is_super_admin: true,
      memberships: [{ role: "ASSESSOR" }],
    });
    expect(result.email).toBe("test@example.com");
    expect(result).not.toHaveProperty("isSuperAdmin");
    expect(result).not.toHaveProperty("is_super_admin");
    expect(result).not.toHaveProperty("memberships");
  });
  it("rejects passwords beyond bcrypt’s byte limit", () => {
    expect(
      registerInput.safeParse({
        username: "name",
        email: "a@b.test",
        password: "🦉".repeat(19),
      }).success,
    ).toBe(false);
  });
  it("requires whole-star ratings and written feedback", () => {
    expect(
      reviewInput.safeParse({ stars: 0, comment: "Good service" }).success,
    ).toBe(false);
    expect(
      reviewInput.safeParse({ stars: 3.5, comment: "Good service" }).success,
    ).toBe(false);
    expect(reviewInput.safeParse({ stars: 5, comment: " " }).success).toBe(
      false,
    );
  });
  it("does not allow a self-invented organization type", () => {
    expect(
      organizationInput.safeParse({
        name: "Example",
        sector: "Testing",
        organizationType: "ADMIN",
      }).success,
    ).toBe(false);
  });
});
describe("Private evidence", () => {
  it("accepts a PDF with matching extension, MIME type, and signature", () => {
    expect(
      validateEvidence(
        new TextEncoder().encode("%PDF-1.7\nfixture"),
        "application/pdf",
        "receipt.pdf",
      ),
    ).toBe("receipt.pdf");
  });
  it("rejects executable content disguised as an image", () => {
    expect(() =>
      validateEvidence(
        new TextEncoder().encode("<script>alert(1)</script>"),
        "image/png",
        "image.png",
      ),
    ).toThrow();
  });
  it("rejects mismatched extension and empty or oversized files", () => {
    expect(() =>
      validateEvidence(
        new TextEncoder().encode("%PDF-1.7"),
        "application/pdf",
        "image.png",
      ),
    ).toThrow();
    expect(() =>
      validateEvidence(new Uint8Array(), "image/png", "image.png"),
    ).toThrow();
    expect(() =>
      validateEvidence(
        new Uint8Array(MAX_FILE_BYTES + 1),
        "image/png",
        "image.png",
      ),
    ).toThrow();
  });
  it("removes control characters and path separators from display names", () => {
    expect(
      validateEvidence(
        new TextEncoder().encode("%PDF-1.7"),
        "application/pdf",
        "../receipt\n.pdf",
      ),
    ).toBe(".._receipt_.pdf");
  });
});
describe("Public responses", () => {
  it("explains the rating limit without exposing database details", () => {
    const r = publicError({
      cause: {
        code: "P0001",
        message:
          "Maximum two active reviews per service in a rolling three-month period",
      },
    });
    expect(r.status).toBe(409);
    expect(r.message).toContain("delete one to free a slot");
  });
  it("withholds unknown database errors and credentials", () => {
    expect(
      publicError(new Error("postgres://secret@host/password")).message,
    ).not.toContain("secret");
  });
  it("uses the existing numeric complaint reference without inventing a year", () => {
    expect(reference("23")).toBe("CMP-000023");
  });
});
