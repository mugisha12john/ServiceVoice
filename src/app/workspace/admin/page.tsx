import Link from "next/link";
import { currentUser } from "@/lib/permissions";
import { adminOverview } from "@/lib/services/admin";
import { PageTitle, Notice, Badge, EmptyState } from "@/components/ui";
import { Denied, StatCards } from "@/components/workspace";
import { ApiForm, ActionButton, type FormField } from "@/components/forms";
const organizationFields: FormField[] = [
  {
    name: "name",
    label: "Organization name",
    required: true,
    minLength: 2,
    maxLength: 200,
  },
  {
    name: "sector",
    label: "Sector",
    required: true,
    minLength: 2,
    maxLength: 100,
  },
  {
    name: "organizationType",
    label: "Organization type",
    type: "select",
    required: true,
    options: [
      { value: "PRIVATE", label: "Private company" },
      { value: "GOVERNMENT", label: "Government institution" },
    ],
  },
  {
    name: "canAssess",
    label: "This organization is an assessing authority",
    type: "checkbox",
  },
  {
    name: "description",
    label: "Public description",
    type: "textarea",
    maxLength: 10000,
  },
  { name: "contactEmail", label: "Public contact email", type: "email" },
  { name: "contactPhone", label: "Public telephone", maxLength: 40 },
  { name: "address", label: "Address", type: "textarea", maxLength: 1000 },
  { name: "isActive", label: "Organization is active", type: "checkbox" },
];
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const u = (await currentUser())!;
  if (!u.is_super_admin)
    return (
      <Denied message="Only the super administrator can manage registrations, staff access, assignments, and public-content reports." />
    );
  const data = await adminOverview(u),
    p = await searchParams,
    tab = p.tab || "overview",
    orgOptions = data.organizations
      .filter((o) => o.is_active)
      .map((o) => ({ value: o.id, label: o.name })),
    userOptions = data.users
      .filter((u) => u.is_active)
      .map((u) => ({ value: u.id, label: `${u.username} · ${u.email}` }));
  return (
    <>
      <PageTitle
        eyebrow="System administration"
        title={
          tab === "organizations"
            ? "Organizations & authorities"
            : tab === "staff"
              ? "Staff & memberships"
              : tab === "assignments"
                ? "Assessor assignments"
                : tab === "access"
                  ? "Account access"
                  : tab === "moderation"
                    ? "Public-content moderation"
                    : "Administration overview"
        }
        description="Manage the registry, staff access, assessment coverage, and public feedback."
      />
      <nav className="tabs" aria-label="Administration sections">
        {[
          ["overview", "Overview"],
          ["organizations", "Organizations"],
          ["staff", "Staff & memberships"],
          ["assignments", "Assignments"],
          ["access", "Access"],
          ["moderation", "Moderation"],
        ].map(([value, label]) => (
          <Link
            href={value === "overview" ? "/workspace/admin" : `?tab=${value}`}
            className={`tab ${tab === value ? "active" : ""}`}
            key={value}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === "overview" && (
        <>
          <StatCards
            cards={[
              {
                label: "Registered organizations",
                value: data.stats.organizations,
                note: "Companies, institutions, and authorities",
              },
              {
                label: "Registered accounts",
                value: data.stats.users,
                note: "Consumer and staff accounts",
              },
              {
                label: "Open content reports",
                value: data.stats.reports,
                note: "Awaiting administrator review",
                type: "pending",
              },
            ]}
          />
          <div className="management-grid">
            <section className="card">
              <h2>Build the service registry</h2>
              <p className="muted">
                Register organizations, appoint their representatives, then
                assign an active assessing authority before private reporting
                begins.
              </p>
              <Link
                href="?tab=organizations"
                className="button secondary small"
              >
                Manage organizations
              </Link>
            </section>
            <section className="card">
              <h2>Keep access intentional</h2>
              <p className="muted">
                Public registration creates consumer accounts. Staff roles are
                granted here through active memberships.
              </p>
              <Link href="?tab=staff" className="button secondary small">
                Manage staff
              </Link>
            </section>
          </div>
          <div className="mt-6">
            <Notice>
              Administrator privileges do not grant access to private complaints
              or evidence. Private-content permissions follow participant
              memberships.
            </Notice>
          </div>
        </>
      )}
      {tab === "organizations" && (
        <div className="management-grid">
          <section className="card">
            <h2>Registered organizations</h2>
            <p className="muted">
              Deactivate to pause public listings while preserving existing
              records.
            </p>
            {data.organizations.length ? (
              <div className="stack">
                {data.organizations.map((o) => (
                  <article
                    className="border-t border-[#dfe5da] pt-4"
                    key={o.id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-xs">{o.name}</strong>
                      <Badge tone={o.is_active ? "green" : "neutral"}>
                        {o.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="muted text-[10px] mt-1">
                      {o.sector} · {o.organization_type}
                      {o.can_assess ? " · Assessing authority" : ""}
                    </p>
                    <details className="mt-4 mb-4">
                      <summary>Edit registration details</summary>
                      <ApiForm
                        endpoint={`/api/v1/admin/organizations/${o.id}`}
                        method="PATCH"
                        fields={organizationFields}
                        defaults={{
                          name: o.name,
                          sector: o.sector,
                          organizationType: o.organization_type,
                          canAssess: o.can_assess,
                          description: o.description || "",
                          contactEmail: o.contact_email || "",
                          contactPhone: o.contact_phone || "",
                          address: o.address || "",
                          isActive: o.is_active,
                        }}
                      />
                    </details>
                    <ActionButton
                      endpoint={`/api/v1/admin/organizations/${o.id}`}
                      method="PATCH"
                      body={{ isActive: !o.is_active }}
                      confirm="Change this organization’s active status? Its historical records will be preserved."
                    >
                      {o.is_active ? "Deactivate" : "Activate"}
                    </ActionButton>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No organizations registered"
                description="Create the first organization using the registration form."
              />
            )}
          </section>
          <section className="card">
            <h2>Register an organization</h2>
            <p className="muted">
              An assessing authority can be a private or government organization
              with assessment enabled.
            </p>
            <ApiForm
              endpoint="/api/v1/admin/organizations"
              submitLabel="Register organization"
              defaults={{ isActive: true, organizationType: "PRIVATE" }}
              fields={organizationFields}
            />
          </section>
        </div>
      )}
      {tab === "staff" && (
        <>
          <div className="management-grid">
            <section className="card">
              <h2>Create a staff account</h2>
              <p className="muted">
                Share the initial password through a secure channel. The staff
                member must verify their own email. Grant a membership
                separately.
              </p>
              <ApiForm
                endpoint="/api/v1/admin/staff-accounts"
                submitLabel="Create staff account"
                successMessage="Staff account created. Assign a membership below; the account holder can sign in and verify their email."
                fields={[
                  {
                    name: "username",
                    label: "Public username",
                    required: true,
                    minLength: 2,
                    maxLength: 80,
                    autoComplete: "off",
                  },
                  {
                    name: "email",
                    label: "Staff email",
                    type: "email",
                    required: true,
                    autoComplete: "off",
                  },
                  {
                    name: "password",
                    label: "Initial password",
                    type: "password",
                    required: true,
                    minLength: 12,
                    maxLength: 72,
                    autoComplete: "new-password",
                  },
                ]}
              />
            </section>
            <section className="card">
              <h2>Assign a membership</h2>
              <p className="muted">
                Assessors must belong to an active organization with assessment
                enabled.
              </p>
              <ApiForm
                endpoint="/api/v1/admin/memberships"
                submitLabel="Assign membership"
                fields={[
                  {
                    name: "userId",
                    label: "Account",
                    type: "select",
                    required: true,
                    options: userOptions,
                  },
                  {
                    name: "organizationId",
                    label: "Organization",
                    type: "select",
                    required: true,
                    options: orgOptions,
                  },
                  {
                    name: "role",
                    label: "Role",
                    type: "select",
                    required: true,
                    options: [
                      {
                        value: "REPRESENTATIVE",
                        label: "Organization representative",
                      },
                      { value: "ASSESSOR", label: "Assessor" },
                    ],
                  },
                ]}
              />
            </section>
          </div>
          <section className="card mt-6">
            <h2>Staff memberships</h2>
            <div className="table-wrap mt-5">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Organization</th>
                    <th>Role</th>
                    <th>Status / action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.memberships.map((m) => (
                    <tr key={m.id}>
                      <td>{m.username}</td>
                      <td>{m.organization_name}</td>
                      <td>{m.role}</td>
                      <td>
                        <ActionButton
                          endpoint={`/api/v1/admin/memberships/${m.id}`}
                          method="PATCH"
                          body={{ isActive: !m.is_active }}
                        >
                          {m.is_active
                            ? "Deactivate membership"
                            : "Activate membership"}
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.memberships.length && (
              <p className="muted text-xs mt-5">No staff memberships yet.</p>
            )}
          </section>
        </>
      )}
      {tab === "assignments" && (
        <div className="management-grid">
          <section className="card">
            <h2>Assessment coverage</h2>
            <p className="muted">
              Assignment changes apply to new complaints. Existing complaints
              retain their original authority.
            </p>
            {data.assignments.length ? (
              <div className="stack">
                {data.assignments.map((a) => (
                  <div className="border-t border-[#dfe5da] pt-4" key={a.id}>
                    <strong className="text-xs">{a.organization_name}</strong>
                    <p className="muted text-[11px] my-2">{a.authority_name}</p>
                    {a.ended_at ? (
                      <Badge>Ended</Badge>
                    ) : (
                      <ActionButton
                        endpoint={`/api/v1/admin/assessor-assignments/${a.id}`}
                        method="PATCH"
                        confirm="End this assignment for future complaints? Existing complaints remain with this authority."
                      >
                        End assignment
                      </ActionButton>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No authorities assigned"
                description="Select an organization and assessing authority to enable routing."
              />
            )}
          </section>
          <section className="card">
            <h2>Assign an authority</h2>
            <p className="muted">
              An existing current assignment is ended before creating the new
              one. Historical assignments are kept.
            </p>
            <ApiForm
              endpoint="/api/v1/admin/assessor-assignments"
              submitLabel="Assign authority"
              fields={[
                {
                  name: "organizationId",
                  label: "Organization to inspect",
                  type: "select",
                  required: true,
                  options: orgOptions,
                },
                {
                  name: "authorityId",
                  label: "Assessing authority",
                  type: "select",
                  required: true,
                  options: data.organizations
                    .filter((o) => o.can_assess && o.is_active)
                    .map((o) => ({ value: o.id, label: o.name })),
                },
              ]}
            />
          </section>
        </div>
      )}
      {tab === "access" && (
        <section className="card">
          <h2>Account access</h2>
          <p className="muted">
            Disabling an account revokes its sessions. Administrator accounts
            require the secure CLI procedure.
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Email · private</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((account) => (
                  <tr key={account.id}>
                    <td>
                      {account.username}
                      {account.is_super_admin && <p>Super administrator</p>}
                    </td>
                    <td>{account.email}</td>
                    <td>
                      <Badge tone={account.is_active ? "green" : "neutral"}>
                        {account.is_active ? "Active" : "Disabled"}
                      </Badge>
                    </td>
                    <td>
                      {!account.is_super_admin && (
                        <ActionButton
                          endpoint={`/api/v1/admin/users/${account.id}`}
                          method="PATCH"
                          body={{ isActive: !account.is_active }}
                          confirm={
                            account.is_active
                              ? "Disable this account and revoke its sessions?"
                              : undefined
                          }
                        >
                          {account.is_active
                            ? "Disable access"
                            : "Restore access"}
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "moderation" && (
        <section className="card">
          <h2>Reported public content</h2>
          <p className="muted">
            Review the content and record a reason. Hiding preserves the
            original rating and review history.
          </p>
          {data.reports.length ? (
            data.reports.map((r) => (
              <article className="review-card" key={r.id}>
                <Badge tone="amber">Open report</Badge>
                <p className="review-body">{r.comment}</p>
                <div className="notice">
                  <div>
                    <strong>Reported by {r.reported_by}</strong>
                    <p>{r.reason}</p>
                  </div>
                </div>
                <ApiForm
                  endpoint={`/api/v1/admin/reports/${r.id}`}
                  method="PATCH"
                  submitLabel="Record decision"
                  fields={[
                    {
                      name: "status",
                      label: "Decision",
                      type: "select",
                      required: true,
                      options: [
                        { value: "HIDDEN", label: "Hide reported content" },
                        {
                          value: "DISMISSED",
                          label: "Dismiss report; keep content public",
                        },
                      ],
                    },
                    {
                      name: "note",
                      label: "Reason for your decision",
                      type: "textarea",
                      required: true,
                      minLength: 10,
                      maxLength: 2000,
                    },
                  ]}
                />
              </article>
            ))
          ) : (
            <EmptyState
              title="No open reports"
              description="Reports about public reviews and replies will appear here for review."
            />
          )}
        </section>
      )}
    </>
  );
}
