import Link from "next/link";
import {
  ArrowRight,
  Globe2,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Sprout,
} from "lucide-react";
import { Directory } from "@/components/directory";
export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <p className="hero-label">
              <span className="h-1.5 w-1.5 rounded-full bg-forest" />A space for
              better service
            </p>
            <h1>
              Your experience.
              <br />
              <em>A voice that matters.</em>
            </h1>
            <p className="hero-description">
              Find services, share honest feedback, and take the next step when
              something goes wrong. Better service starts with a conversation.
            </p>
            <a className="button" href="#directory">
              Explore organizations
              <ArrowRight size={16} />
            </a>
            <div className="trust-row">
              <span>
                <Globe2 size={13} />
                Public service reviews
              </span>
              <span>
                <LockKeyhole size={13} />
                Private complaints
              </span>
              <span>
                <ShieldCheck size={13} />
                Assigned assessment
              </span>
            </div>
          </div>
          <div className="hero-side">
            <div className="hero-side-header">
              <div>
                <p className="eyebrow">A clear way forward</p>
                <h2>
                  From your experience
                  <br />
                  to a better outcome.
                </h2>
              </div>
              <span className="hero-side-icon">
                <MessageSquareText size={22} />
              </span>
            </div>
            {[
              [
                "01",
                "Discover a service",
                "Browse organizations and read consumer experiences.",
              ],
              [
                "02",
                "Make your voice heard",
                "Leave a public review or report a problem privately.",
              ],
              [
                "03",
                "Follow the conversation",
                "Discuss a solution, then confirm when it’s resolved.",
              ],
            ].map(([n, title, copy]) => (
              <div className="path-step" key={n}>
                <span className="step-number">{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <div className="container">
        <Directory home />
        <section className="section" id="how-it-works">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Two ways to be heard</p>
              <h2>The right space for every experience.</h2>
            </div>
            <Sprout size={27} className="muted" />
          </div>
          <div className="how-grid">
            <div className="how-card">
              <span>01 / PUBLIC FEEDBACK</span>
              <h3>Share what the service was like.</h3>
              <p>
                Rate a specific service from one to five stars. Your username,
                profile picture, and review are public; your email stays
                private.
              </p>
            </div>
            <div className="how-card">
              <span>02 / PRIVATE COMPLAINTS</span>
              <h3>Get a problem in front of the right people.</h3>
              <p>
                Your complaint goes to the organization and its assigned
                assessor. They can read the details, examine evidence, and
                discuss next steps.
              </p>
            </div>
            <div className="how-card">
              <span>03 / CONSUMER CONFIRMATION</span>
              <h3>You have the final word on resolution.</h3>
              <p>
                The organization has 72 hours to first respond. A proposed
                solution stays pending until you confirm that it resolves your
                complaint.
              </p>
            </div>
          </div>
        </section>
        <div className="info-band">
          <div>
            <h2>Every experience is a chance to improve.</h2>
            <p>
              Create a consumer account to review a service or report a problem.
            </p>
          </div>
          <Link href="/register" className="button">
            Make your voice heard
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </>
  );
}
