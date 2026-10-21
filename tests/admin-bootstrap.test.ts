import { describe, expect, it } from "vitest";
import { registerInput } from "../src/lib/validation";
import {
  AdminBootstrapError,
  adminBootstrapErrorMessage,
} from "../scripts/lib/admin-bootstrap";

describe("Administrator bootstrap diagnostics", () => {
  it("explains the existing administrator guard and password behavior", () => {
    const message = adminBootstrapErrorMessage(
      new AdminBootstrapError("EXISTS"),
    );
    expect(message).toContain("already exists");
    expect(message).toContain("does not reset passwords");
  });

  it("reports validation requirements without echoing the supplied password", () => {
    const result = registerInput.safeParse({
      username: "Test administrator",
      email: "operator@example.test",
      password: "test-short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = adminBootstrapErrorMessage(result.error);
      expect(message).toContain("12–72");
      expect(message).not.toContain("test-short");
    }
  });

  it("explains a duplicate account without revealing database row details", () => {
    const message = adminBootstrapErrorMessage({
      code: "23505",
      detail: "Fictional sensitive database row",
    });
    expect(message).toContain("No account was promoted");
    expect(message).not.toContain("Fictional sensitive");
  });

  it("distinguishes network failure from invalid database credentials", () => {
    expect(adminBootstrapErrorMessage({ code: "EAI_AGAIN" })).toContain(
      "network",
    );
    expect(adminBootstrapErrorMessage({ code: "28P01" })).toContain(
      "database credentials",
    );
  });

  it("preserves TLS verification when explaining certificate errors", () => {
    expect(
      adminBootstrapErrorMessage({ code: "ERR_TLS_CERT_ALTNAME_INVALID" }),
    ).toContain("keep TLS verification enabled");
  });

  it("withholds unknown errors, connection URLs, and row contents", () => {
    for (const error of [
      new Error("postgresql://fictional-private-value@example.test/database"),
      { code: "UNRECOGNIZED", detail: "fictional-private-value" },
    ]) {
      expect(adminBootstrapErrorMessage(error)).not.toContain(
        "fictional-private-value",
      );
    }
  });
});
