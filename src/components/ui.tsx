import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Inbox, Star, Sprout, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="ServiceVoice home">
      <span className="brand-symbol">
        <Sprout size={23} />
      </span>
      <span>
        ServiceVoice<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  return <span className={cn("badge", `badge-${tone}`)}>{children}</span>;
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Inbox size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={cn("notice", error && "notice-error")}
      role={error ? "alert" : "status"}
    >
      <AlertCircle size={18} />
      <div>{children}</div>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Rating({
  average,
  count,
}: {
  average: string | null;
  count: string | number;
}) {
  return Number(count) === 0 || average === null ? (
    <span className="muted text-sm">No ratings yet</span>
  ) : (
    <span className="rating">
      <Star size={16} fill="currentColor" />
      <strong>{Number(average).toFixed(1)}</strong>
      <span className="muted">
        ({count} {Number(count) === 1 ? "reviewer" : "reviewers"})
      </span>
    </span>
  );
}
export function Stars({ value }: { value: number }) {
  return (
    <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          aria-hidden="true"
          size={16}
          key={i}
          className={i < value ? "star-on" : "star-off"}
          fill="currentColor"
        />
      ))}
    </span>
  );
}
export function ArrowLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="text-link">
      {children}
      <ArrowRight size={16} />
    </Link>
  );
}
export function Avatar({
  name,
  url,
  size = "normal",
}: {
  name: string;
  url?: string | null;
  size?: "normal" | "large";
}) {
  return (
    <span className={cn("avatar", size === "large" && "avatar-large")}>
      {url ? (
        <Image
          src={url}
          alt=""
          width={size === "large" ? 44 : 35}
          height={size === "large" ? 44 : 35}
          unoptimized
          referrerPolicy="no-referrer"
        />
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
