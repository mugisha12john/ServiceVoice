import { currentUser } from "@/lib/permissions";
import { ApiForm } from "@/components/forms";
import { Badge, Notice, PageTitle } from "@/components/ui";
import Link from "next/link";
export default async function Profile() {
  const u = (await currentUser())!;
  return (
    <>
      <PageTitle
        eyebrow="Your account"
        title="Profile settings"
        description="Choose how you appear alongside your public reviews."
      />
      <div className="two-column">
        <section className="card">
          <h2>Public profile</h2>
          <p className="muted">
            Your username and profile picture appear publicly. Your email stays
            private.
          </p>
          <ApiForm
            endpoint="/api/v1/me"
            method="PATCH"
            defaults={{
              username: u.username,
              profilePictureUrl: u.profile_picture_url || "",
            }}
            fields={[
              {
                name: "username",
                label: "Public username",
                required: true,
                minLength: 2,
                maxLength: 80,
                autoComplete: "username",
              },
              {
                name: "profilePictureUrl",
                label: "Profile picture URL",
                type: "url",
                hint: "Optional. Use an HTTPS URL to a profile image you have permission to use. Leave blank to show your initials.",
              },
            ]}
          />
        </section>
        <aside className="card">
          <h2>Account details</h2>
          <dl className="meta-list mt-6">
            <div>
              <dt>Email address · private</dt>
              <dd>{u.email}</dd>
            </div>
            <div>
              <dt>Email status</dt>
              <dd>
                <Badge tone={u.email_verified_at ? "green" : "amber"}>
                  {u.email_verified_at ? "Verified" : "Verification needed"}
                </Badge>
              </dd>
            </div>
          </dl>
          {!u.email_verified_at && (
            <div className="mt-6">
              <Notice>
                <Link href="/verify-email">Verify your email</Link> to
                contribute.
              </Notice>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
