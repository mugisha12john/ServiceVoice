import { PageTitle } from "@/components/ui";
export default function About() {
  return (
    <div className="container prose">
      <PageTitle
        eyebrow="About & privacy"
        title="A clearer conversation about service."
        description="ServiceVoice is the working name of the Company Service Evaluation and Complaint Management System, an academic project designed for continued development."
      />
      <h2>Public feedback</h2>
      <p>
        Reviews and organization replies are public. Reviews display your
        username and optional profile picture. Your account email and password
        are never included in public review responses. Only your latest active
        rating for each service contributes to its average. Email verification
        confirms control of a mailbox; it does not prove service consumption.
      </p>
      <h2>Private complaints</h2>
      <p>
        Complaint descriptions, discussions, proposals, and evidence are
        accessible only to the submitting consumer, active representatives of
        the organization, and active assessors of the originally assigned
        authority. Administrator privileges alone do not grant access. Evidence
        downloads require an authenticated permission check.
      </p>
      <h2>Response and resolution</h2>
      <p>
        The organization has 72 elapsed hours to first respond. This is a
        first-response deadline, not a promise of resolution. Only the
        submitting consumer can confirm a proposed solution. Pending and
        Resolved are the two complaint statuses.
      </p>
      <h2>Account and file information</h2>
      <p>
        We store account details, service feedback, and complaint records to
        support these workflows. Sessions use secure cookies in production.
        Optional profile images use a publicly accessible HTTPS URL and may be
        loaded from a third-party host. Avoid using a URL containing personal
        identifiers or access tokens.
      </p>
      <h2>Reporting inappropriate content</h2>
      <p>
        Signed-in, verified users can report a review or reply. Administrators
        review reports manually and can hide inappropriate public content with a
        recorded reason. Hiding content preserves the original rating, review
        history, and allowance. Retention, appeals, and account recovery
        policies must be finalized before public operation.
      </p>
    </div>
  );
}
