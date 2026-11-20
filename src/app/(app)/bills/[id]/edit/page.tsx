"use client";
import { use } from "react";
import { useData } from "@/components/auth-provider";
import { BillForm } from "@/components/bill-form";
import { Guard } from "@/components/guard";
import { ErrorNote, Loading } from "@/components/ui";
import type { Bill } from "@/lib/types";

export default function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useData<Bill>(`/api/bills/${id}`);
  return (
    <Guard need="bill:create" what="editing bills">
      {error ? <div className="p-6"><ErrorNote message={error} /></div> : !data ? <Loading />
        : data.status !== "pending_approval" && data.status !== "rejected" ? <div className="p-6"><ErrorNote message="Approved bills cannot be edited." /></div>
        : <BillForm existing={data} />}
    </Guard>
  );
}
