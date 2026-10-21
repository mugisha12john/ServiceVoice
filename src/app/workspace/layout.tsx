import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { currentUser } from "@/lib/permissions";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <>
      <Header />
      <div className="workspace">
        <Suspense>
          <Sidebar
            user={{
              username: user.username,
              profile_picture_url: user.profile_picture_url,
              email_verified_at: user.email_verified_at,
              is_super_admin: user.is_super_admin,
              memberships: user.memberships,
            }}
          />
        </Suspense>
        <main className="workspace-main" id="main" tabIndex={-1}>
          <div className="workspace-topline">
            <span>ServiceVoice / Workspace</span>
            <span className="flex items-center gap-1.5">
              <LockKeyhole size={11} />
              Your secure workspace
            </span>
          </div>
          {children}
        </main>
      </div>
    </>
  );
}
