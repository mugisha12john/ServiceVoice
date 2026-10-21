import type { Metadata } from "next";
import { Directory } from "@/components/directory";
export const metadata: Metadata = { title: "Explore organizations" };
export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const s = await searchParams;
  const page = Math.max(1, Math.min(Number(s.page) || 1, 10000));
  return (
    <div className="container">
      <Directory q={s.q} sector={s.sector} type={s.type} page={page} />
    </div>
  );
}
