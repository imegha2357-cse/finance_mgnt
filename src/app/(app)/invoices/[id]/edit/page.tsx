"use client";
import { use } from "react";
import { useData } from "@/components/auth-provider";
import { Guard } from "@/components/guard";
import { InvoiceForm } from "@/components/invoice-form";
import { ErrorNote, Loading } from "@/components/ui";
import type { Invoice } from "@/lib/types";

export default function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useData<{ invoice: Invoice }>(`/api/invoices/${id}`);
  return (
    <Guard need="invoice:create" what="editing invoices">
      {error ? <div className="p-6"><ErrorNote message={error} /></div> : !data ? <Loading />
        : data.invoice.status !== "draft" ? <div className="p-6"><ErrorNote message="Only draft invoices can be edited. Use a credit note to correct a sent invoice." /></div>
        : <InvoiceForm existing={data.invoice} />}
    </Guard>
  );
}
