"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  Star,
  MessagesSquare,
  Settings,
  Building2,
  ShieldCheck,
  Users,
  Waypoints,
  Flag,
  Globe2,
  LogOut,
} from "lucide-react";
import type { Viewer } from "@/lib/permissions";
import { Avatar } from "./ui";
import { ActionButton } from "./forms";
import { cn } from "@/lib/utils";
type NavItem = { href: string; label: string; icon: typeof Star };
function Group({ title, items }: { title: string; items: NavItem[] }) {
  const pathname = usePathname(),
    search = useSearchParams();
  return (
    <nav className="nav-group" aria-label={title}>
      <p className="eyebrow">{title}</p>
      {items.map((i) => {
        const [path, query] = i.href.split("?"),
          active =
            path === pathname &&
            (!query
              ? !search.get("scope") &&
                !(pathname === "/workspace/admin" && search.get("tab"))
              : new URLSearchParams(query).get("scope")
                ? search.get("scope") ===
                  new URLSearchParams(query).get("scope")
                : search.get("tab") === new URLSearchParams(query).get("tab"));
        return (
          <Link
            href={i.href}
            key={i.href}
            className={cn(active && "active")}
            aria-current={active ? "page" : undefined}
          >
            <i.icon size={16} />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
export function Sidebar({
  user,
}: {
  user: Pick<
    Viewer,
    | "username"
    | "profile_picture_url"
    | "email_verified_at"
    | "is_super_admin"
    | "memberships"
  >;
}) {
  const representative = user.memberships.some(
      (m) => m.role === "REPRESENTATIVE",
    ),
    assessor = user.memberships.some((m) => m.role === "ASSESSOR");
  return (
    <aside className="sidebar">
      <div className="sidebar-profile">
        <Avatar
          name={user.username}
          url={user.profile_picture_url}
          size="large"
        />
        <div>
          <strong>{user.username}</strong>
          <span className="muted">
            {user.is_super_admin
              ? "Super administrator"
              : representative
                ? "Organization representative"
                : assessor
                  ? "Assigned assessor"
                  : "Consumer account"}
          </span>
        </div>
      </div>
      {!user.is_super_admin && (
        <Group
          title="My account"
          items={[
            { href: "/workspace", label: "Overview", icon: LayoutDashboard },
            { href: "/workspace/reviews", label: "My reviews", icon: Star },
            {
              href: "/workspace/complaints",
              label: "My complaints",
              icon: MessagesSquare,
            },
            {
              href: "/workspace/profile",
              label: "Profile settings",
              icon: Settings,
            },
          ]}
        />
      )}
      {representative && (
        <Group
          title="Organization"
          items={[
            {
              href: "/workspace/organization",
              label: "Organization overview",
              icon: Building2,
            },
            {
              href: "/workspace/organization/manage",
              label: "Profile & services",
              icon: Settings,
            },
            {
              href: "/workspace/reviews?scope=organization",
              label: "Reviews & replies",
              icon: Star,
            },
            {
              href: "/workspace/complaints?scope=organization",
              label: "Complaint inbox",
              icon: MessagesSquare,
            },
          ]}
        />
      )}
      {assessor && (
        <Group
          title="Assessment"
          items={[
            {
              href: "/workspace/assessor",
              label: "Assessment overview",
              icon: ShieldCheck,
            },
            {
              href: "/workspace/assessor/organizations",
              label: "Assigned organizations",
              icon: Building2,
            },
            {
              href: "/workspace/complaints?scope=assessor",
              label: "Assigned complaints",
              icon: MessagesSquare,
            },
          ]}
        />
      )}
      {user.is_super_admin && (
        <Group
          title="Administration"
          items={[
            {
              href: "/workspace/admin",
              label: "Overview",
              icon: LayoutDashboard,
            },
            {
              href: "/workspace/admin?tab=organizations",
              label: "Organizations",
              icon: Building2,
            },
            {
              href: "/workspace/admin?tab=staff",
              label: "Staff & memberships",
              icon: Users,
            },
            {
              href: "/workspace/admin?tab=assignments",
              label: "Assessor assignments",
              icon: Waypoints,
            },
            {
              href: "/workspace/admin?tab=access",
              label: "Access management",
              icon: ShieldCheck,
            },
            {
              href: "/workspace/admin?tab=moderation",
              label: "Content moderation",
              icon: Flag,
            },
            {
              href: "/workspace/profile",
              label: "Profile settings",
              icon: Settings,
            },
          ]}
        />
      )}
      <div className="sidebar-bottom">
        <Link href="/organizations" className="text-link mb-5">
          <Globe2 size={15} />
          Public directory
        </Link>
        <ActionButton endpoint="/api/v1/auth/logout" redirectTo="/login">
          <LogOut size={13} />
          Sign out
        </ActionButton>
      </div>
    </aside>
  );
}
