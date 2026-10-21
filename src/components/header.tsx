import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { currentUser } from "@/lib/permissions";
import { Brand } from "./ui";
export async function Header() {
  const user = await currentUser();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav aria-label="Main navigation">
          <Link href="/organizations">Explore organizations</Link>
          <Link href="/#how-it-works" className="hide-mobile">
            How it works
          </Link>
        </nav>
        <div className="header-actions">
          {user ? (
            <Link className="button small" href="/workspace">
              My workspace
              <ArrowUpRight size={15} />
            </Link>
          ) : (
            <>
              <Link href="/login" className="login-link">
                Log in
              </Link>
              <Link href="/register" className="button small">
                Create account
                <ArrowUpRight size={15} />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <Brand />
        <p>Better experiences. More accountable services.</p>
        <div>
          <Link href="/organizations">Directory</Link>
          <Link href="/about">About & privacy</Link>
        </div>
      </div>
      <div className="container footer-note">
        Public feedback reflects consumer experiences. Email verification
        confirms mailbox access, not a purchase or an official assessment.
      </div>
    </footer>
  );
}
