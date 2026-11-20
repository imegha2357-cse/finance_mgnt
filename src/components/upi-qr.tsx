"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** UPI deep link (NPCI "upi://pay") with the amount and invoice number filled in. */
export const upiLink = (o: { upiId: string; payee: string; amount: number; note: string }) =>
  `upi://pay?${new URLSearchParams({ pa: o.upiId, pn: o.payee.slice(0, 50), am: o.amount.toFixed(2), cu: "INR", tn: o.note.slice(0, 80) }).toString()}`;

/** Scan-to-pay QR for any UPI app (GPay, PhonePe, Paytm, BHIM, bank apps). Free: no payment gateway needed. */
export function UpiQr({ upiId, payee, amount, note, size = 132 }: { upiId: string; payee: string; amount: number; note: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  const link = upiLink({ upiId, payee, amount, note });
  useEffect(() => {
    let alive = true;
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null));
    return () => { alive = false; };
  }, [link]);
  return (
    <div className="flex items-center gap-3">
      <div role="img" aria-label={`UPI QR code to pay ${upiId}`} style={{ width: size, height: size }} className="shrink-0 rounded-md border border-line bg-white p-1 [&>svg]:size-full" dangerouslySetInnerHTML={svg ? { __html: svg } : undefined} />
      <div className="text-xs leading-relaxed">
        <div className="font-medium text-ink">Scan to pay with any UPI app</div>
        <div className="text-muted">UPI ID: <span className="font-medium text-ink">{upiId}</span></div>
        <div className="text-muted">Amount is filled in for you</div>
      </div>
    </div>
  );
}
