import Link from "next/link";
import {
  ArrowUpRight,
  Clock3,
  MessageSquareText,
  CheckCircle2,
} from "lucide-react";
import { Badge, EmptyState } from "./ui";
import { date, reference } from "@/lib/utils";
import type { Complaint } from "@/lib/services/complaints";
export function Denied({
  message = "This workspace is available to authorized staff only.",
}: {
  message?: string;
}) {
  return (
    <EmptyState
      title="You don’t have access to this area"
      description={message}
      action={
        <Link href="/workspace" className="button secondary small">
          Back to my workspace
        </Link>
      }
    />
  );
}
export function ComplaintTable({
  items,
  emptyTitle = "No complaints yet",
  emptyDescription = "Your complaints will appear here when you report a problem with a service.",
}: {
  items: Complaint[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  return items.length ? (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Reference / service</th>
            <th>Organization</th>
            <th>Status</th>
            <th>First response</th>
            <th aria-label="Open complaint" />
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td>
                <Link href={`/workspace/complaints/${c.id}`}>
                  <strong>{reference(c.reference_number)}</strong>
                </Link>
                <p>{c.service_name}</p>
              </td>
              <td>
                {c.organization_name}
                <p>{date(c.submitted_at)}</p>
              </td>
              <td>
                <Badge tone={c.status === "RESOLVED" ? "green" : "amber"}>
                  {c.status === "RESOLVED" ? "Resolved" : "Pending"}
                </Badge>
              </td>
              <td>
                {c.first_response_at ? (
                  <span className="text-[10px] text-[#48683b]">
                    Received {date(c.first_response_at)}
                  </span>
                ) : c.overdue ? (
                  <Badge tone="red">Response overdue</Badge>
                ) : (
                  <span className="muted text-[10px]">
                    Due {date(c.response_due_at)}
                  </span>
                )}
              </td>
              <td>
                <Link
                  href={`/workspace/complaints/${c.id}`}
                  className="text-link"
                  aria-label={`Open ${reference(c.reference_number)}`}
                >
                  <ArrowUpRight size={15} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <EmptyState title={emptyTitle} description={emptyDescription} />
  );
}
export function StatCards({
  cards,
}: {
  cards: {
    label: string;
    value: number;
    note: string;
    type?: "pending" | "resolved" | "total";
  }[];
}) {
  return (
    <div className="stats-grid">
      {cards.map((s, i) => {
        const Icon =
          s.type === "resolved"
            ? CheckCircle2
            : s.type === "pending"
              ? Clock3
              : MessageSquareText;
        return (
          <div className="stat-card" key={i}>
            <div className="stat-label">
              {s.label}
              <Icon size={16} />
            </div>
            <div className="stat-value">{s.value}</div>
            <p className="stat-note">{s.note}</p>
          </div>
        );
      })}
    </div>
  );
}
