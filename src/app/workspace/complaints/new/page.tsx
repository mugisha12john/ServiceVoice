import Link from "next/link";
import { currentUser } from "@/lib/permissions";
import { serviceOptions, getService } from "@/lib/services/catalog";
import { storageConfigured } from "@/lib/storage";
import { uuid } from "@/lib/validation";
import { ApiForm } from "@/components/forms";
import { PageTitle, Notice, EmptyState } from "@/components/ui";
export default async function NewComplaint({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const u = (await currentUser())!,
    p = await searchParams;
  const options = await serviceOptions(),
    selected =
      p.service && uuid.safeParse(p.service).success
        ? await getService(p.service)
        : null;
  if (selected && !options.some((s) => s.id === selected.id))
    options.push({
      id: selected.id,
      name: selected.name,
      organization_name: selected.organization_name,
    });
  return (
    <>
      <PageTitle
        eyebrow="A private path forward"
        title="Report a problem"
        description="Describe what happened and the outcome you’re hoping for. This will go to the organization and its assigned assessor."
      />
      <div className="two-column">
        <section className="card">
          {!u.email_verified_at ? (
            <Notice>
              <Link href="/verify-email">Verify your email</Link> before
              submitting a complaint.
            </Notice>
          ) : !options.length ? (
            <EmptyState
              title="No active services available"
              description="An organization must first list a service and have an assigned assessing authority."
            />
          ) : !selected ? (
            <>
              <h2>Select the service</h2>
              <p className="muted">
                Choose the service involved so your report reaches the correct
                organization.
              </p>
              <form method="get" className="api-form">
                <div className="field">
                  <label htmlFor="complaint-service">Service</label>
                  <select id="complaint-service" name="service" required>
                    <option value="">Choose a service</option>
                    {options.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.organization_name} · {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="button">Continue</button>
              </form>
            </>
          ) : !selected.accepts_complaints ? (
            <Notice error>
              This service’s organization does not have an active assessing
              authority. Contact the administrator before submitting a
              complaint.
            </Notice>
          ) : (
            <>
              <h2>{selected.name}</h2>
              <p className="muted">
                {selected.organization_name} ·{" "}
                <Link href="/workspace/complaints/new" className="underline">
                  Choose another service
                </Link>
              </p>
              <ApiForm
                endpoint={`/api/v1/services/${selected.id}/complaints`}
                submitLabel="Submit private complaint"
                redirectTo="/workspace/complaints/{id}"
                fields={[
                  {
                    name: "description",
                    label: "What happened?",
                    type: "textarea",
                    required: true,
                    minLength: 20,
                    maxLength: 20000,
                    placeholder:
                      "Describe the service, what went wrong, any steps already taken, and the outcome you need.",
                    hint: "Include enough detail to investigate. Avoid passwords, card numbers, or unnecessary sensitive information.",
                  },
                ]}
              />
            </>
          )}
        </section>
        <aside className="stack">
          <section className="card">
            <h2>What happens next?</h2>
            <ol className="text-xs text-[#616c5f] pl-5 list-decimal space-y-4 mt-5">
              <li>
                The report is shared immediately with the organization and its
                assigned assessor.
              </li>
              <li>
                Add supporting images or PDFs on the complaint page after
                submission.
              </li>
              <li>
                The organization has 72 hours to provide its first response.
              </li>
              <li>
                Discuss a solution and confirm resolution when you are
                satisfied.
              </li>
            </ol>
          </section>
          {!storageConfigured() && (
            <Notice>
              Private evidence storage is not configured yet. You can submit
              your complaint now and add evidence when storage becomes
              available.
            </Notice>
          )}
        </aside>
      </div>
    </>
  );
}
