"use client";
import { use } from "react";
import { Guard } from "@/components/guard";
import { PartyDetail } from "@/components/party-detail";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Guard need="books:read"><PartyDetail id={id} type="customer" /></Guard>;
}
