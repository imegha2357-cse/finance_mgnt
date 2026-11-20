"use client";
import { useSearchParams } from "next/navigation";
import { Guard } from "@/components/guard";
import { InvoiceForm } from "@/components/invoice-form";

export default function NewInvoicePage() {
  const params = useSearchParams();
  return <Guard need="invoice:create" what="creating invoices"><InvoiceForm presetCustomer={params.get("customer") ?? undefined} /></Guard>;
}
