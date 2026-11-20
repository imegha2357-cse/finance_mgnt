"use client";
import { BillForm } from "@/components/bill-form";
import { Guard } from "@/components/guard";

export default function NewBillPage() {
  return <Guard need="bill:create" what="recording bills"><BillForm /></Guard>;
}
