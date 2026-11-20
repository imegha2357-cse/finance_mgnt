"use client";
import { Guard } from "@/components/guard";
import { PartiesView } from "@/components/parties-view";

export default function Page() {
  return <Guard need="books:read"><PartiesView type="customer" /></Guard>;
}
