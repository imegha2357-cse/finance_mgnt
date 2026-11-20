import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy notice · Ledgerly" };

/**
 * Privacy notice written for the Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025.
 * The bracketed details must be filled in by the business that runs this deployment before going live.
 */
function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 text-lg font-semibold">{children}</h2>;
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <Link href="/welcome" className="text-sm text-accent">← Ledgerly</Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Privacy notice</h1>
        <p className="mt-2 text-sm text-muted">Under the Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025.</p>
        <p className="mt-4 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-warn">
          Before going live, the business running this site must replace the bracketed details (company name, grievance officer, contact) with its own and have this notice reviewed by its legal adviser.
        </p>

        <div className="mt-6 space-y-3 leading-relaxed text-ink/90">
          <p>[Company name] (&ldquo;we&rdquo;) runs Ledgerly to keep the accounting records of businesses that use it. This notice explains what personal data we process, why, and the rights you have.</p>

          <H>What we collect</H>
          <ul className="list-disc space-y-1 pl-5">
            <li>Account details of users: name, email address, role, and sign-in records.</li>
            <li>Details of a business&apos;s customers and vendors that the business enters: name, GSTIN, PAN, Udyam number, phone, email, address and bank or UPI details.</li>
            <li>Financial records: invoices, bills, payments, bank statement lines and receipts uploaded by users.</li>
          </ul>

          <H>Why we use it</H>
          <p>Only to provide the accounting service the business asked for: preparing invoices and GST returns, tracking payments, TDS and MSME deadlines, and producing reports for the business and its chartered accountant. We do not sell personal data or use it for advertising.</p>

          <H>How long we keep it</H>
          <p>For as long as the business keeps its account, and afterwards for the period that Indian tax law requires books of account to be kept. After that it is erased.</p>

          <H>Your rights</H>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Access:</strong> ask what personal data we hold about you. Admins can download all of their organisation&apos;s data from Settings.</li>
            <li><strong>Correction and erasure:</strong> ask us to correct or delete your data, unless the law requires us to keep it.</li>
            <li><strong>Grievance:</strong> raise a complaint with our grievance officer, and if it is not resolved, with the Data Protection Board of India.</li>
            <li><strong>Nominate:</strong> name someone to exercise these rights on your behalf.</li>
          </ul>

          <H>Security and breaches</H>
          <p>Access is limited by role, every change is recorded in an audit log, and data is encrypted in transit. If a personal data breach occurs we will inform affected people and the Data Protection Board as the DPDP Rules require.</p>

          <H>Where data is stored</H>
          <p>[State the hosting provider and region, e.g. Google Cloud Firestore, Mumbai (asia-south1).]</p>

          <H>Contact</H>
          <p>Grievance officer: [Name], [email], [phone]. We respond within the time the DPDP Rules set.</p>
        </div>
      </div>
    </div>
  );
}
