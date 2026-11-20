"use client";
import { Guard } from "@/components/guard";
import { PaymentsList } from "@/components/payments-view";

export default function Page() {
  return <Guard need="books:read"><PaymentsList kind="made" /></Guard>;
}
