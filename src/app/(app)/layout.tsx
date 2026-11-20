import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { Loading } from "@/components/ui";

// The shell reads the URL and the signed-in user on the client, so it streams in after the static frame.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
