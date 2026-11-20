"use client";
import Link from "next/link";
import { useState } from "react";
import { useAuth, useData } from "@/components/auth-provider";
import { Guard } from "@/components/guard";
import { Empty, ErrorNote, ListHeader, ListTable, Loading, Td, Th } from "@/components/ui";
import { fmtDate, money } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { CreditNote } from "@/lib/types";

export default function CreditNotesPage() {
  const { user } = useAuth();
  const { data, error, loading } = useData<CreditNote[]>("/api/credit-notes");
  const [view, setView] = useState("all");
  return (
    <Guard need="books:read">
      <ListHeader views={[{ value: "all", label: "All credit notes" }]} view={view} onView={setView}
        newHref={user && can(user.role, "invoice:update") ? "/credit-notes/new" : undefined} />
      <p className="border-b border-line bg-canvas px-6 py-2.5 text-sm text-muted">A credit note reduces what a customer owes on a sent invoice (returns, discounts after billing, billing errors). It also reverses the GST.</p>
      <ErrorNote message={error} />
      {loading && !data ? <Loading /> : !data?.length ? <Empty title="No credit notes yet" detail="Open an unpaid invoice and choose Create Credit Note." /> : (
        <ListTable head={<tr><Th>Date</Th><Th>Credit Note#</Th><Th>Customer</Th><Th>Invoice no.</Th><Th>Reason</Th><Th right>Amount</Th></tr>}>
          {data.map((c) => (
            <tr key={c.id}>
              <Td className="whitespace-nowrap">{fmtDate(c.date)}</Td>
              <Td className="text-accent">{c.number}</Td>
              <Td>{c.customerName}</Td>
              <Td><Link href={`/invoices/${c.invoiceId}`} className="text-accent hover:underline">{c.invoiceNumber}</Link></Td>
              <Td className="text-muted">{c.reason}</Td>
              <Td right className="font-medium">{money(c.total)}</Td>
            </tr>
          ))}
        </ListTable>
      )}
    </Guard>
  );
}
