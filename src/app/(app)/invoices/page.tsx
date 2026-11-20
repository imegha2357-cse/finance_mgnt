"use client";
import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useData } from "@/components/auth-provider";
import { Empty, ErrorNote, ListHeader, ListTable, Loading, Td, Th } from "@/components/ui";
import { InvoiceStatus } from "@/components/status";
import { fmtDate, money, today } from "@/lib/format";
import { can } from "@/lib/permissions";
import { invoiceBalance, type Invoice } from "@/lib/types";

type View = "all" | "draft" | "sent" | "overdue" | "paid" | "void";
const VIEWS: { value: View; label: string }[] = [
  { value: "all", label: "All invoices" }, { value: "draft", label: "Draft" }, { value: "sent", label: "Unpaid" },
  { value: "overdue", label: "Overdue" }, { value: "paid", label: "Paid / Closed" }, { value: "void", label: "Void" },
];

export default function InvoicesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const { data, error, loading } = useData<Invoice[]>("/api/invoices");
  const [view, setView] = useState<View>((params.get("view") as View) ?? "all");
  const t0 = today();
  const rows = useMemo(() => (data ?? []).filter((i) =>
    view === "all" || (view === "overdue" ? i.status === "sent" && i.dueDate < t0 : i.status === view)), [data, view, t0]);
  const totalDue = rows.reduce((a, i) => a + invoiceBalance(i), 0);

  return (
    <div>
      <ListHeader views={VIEWS} view={view} onView={setView} newHref={user && can(user.role, "invoice:create") ? "/invoices/new" : undefined} />
      <div className="flex gap-6 border-b border-line bg-canvas px-6 py-2.5 text-sm">
        <span className="text-muted">Invoices: <span className="font-medium text-ink">{rows.length}</span></span>
        <span className="text-muted">Balance due: <span className="num font-medium text-ink">{money(totalDue)}</span></span>
      </div>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : rows.length === 0 ? (data?.length ?? 0) === 0
        ? <Empty icon={FileText} title="Send your first GST invoice" detail="Pick a customer and items. CGST/SGST or IGST is worked out for you, with a Razorpay link to collect payment." action={user && can(user.role, "invoice:create") ? { label: "New invoice", href: "/invoices/new" } : undefined} secondary={{ label: "Add a customer first", href: "/customers?new=1" }} />
        : <Empty title="No invoices in this view" detail="Nothing matches this filter right now." action={{ label: "Show all invoices", onClick: () => setView("all") }} /> : (
        <ListTable head={<tr><Th className="hidden md:table-cell">Date</Th><Th className="hidden md:table-cell">Invoice no.</Th><Th>Customer</Th><Th>Status</Th><Th className="hidden md:table-cell">Due date</Th><Th right className="hidden md:table-cell">Amount</Th><Th right>Balance due</Th></tr>}>
          {rows.map((i) => (
            <tr key={i.id} className="cursor-pointer" onClick={() => router.push(`/invoices/${i.id}`)}>
              <Td className="hidden whitespace-nowrap md:table-cell">{fmtDate(i.issueDate)}</Td>
              <Td className="hidden md:table-cell"><Link href={`/invoices/${i.id}`} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>{i.number}</Link></Td>
              <Td>{i.customerName}<div className="text-xs text-muted md:hidden">{i.status === "draft" ? "Draft" : i.number} · {fmtDate(i.issueDate)}</div></Td>
              <Td><InvoiceStatus inv={i} /></Td>
              <Td className="hidden whitespace-nowrap md:table-cell">{fmtDate(i.dueDate)}</Td>
              <Td right className="hidden md:table-cell">{money(i.total)}</Td>
              <Td right>{money(i.status === "draft" ? i.total : invoiceBalance(i))}</Td>
            </tr>
          ))}
        </ListTable>
      )}
    </div>
  );
}
