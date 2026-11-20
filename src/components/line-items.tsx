"use client";
import { useRef } from "react";
import { PlusCircle, X } from "lucide-react";
import { GST_RATES, computeTax, STATES } from "@/lib/gst";
import { money } from "@/lib/format";
import type { Item, LineItem } from "@/lib/types";

export const emptyLine = (): LineItem => ({ description: "", hsn: "", qty: 1, rate: 0, gstRate: 18 });

const cell = "h-9 w-full bg-transparent px-2.5 text-sm outline-none focus:bg-accent-soft/60";
const num = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Item table with a live GST breakup (CGST+SGST within a state, IGST across states). */
export function LineItemsEditor({ items, onChange, supplierState, placeOfSupply, showHsn, catalog }: {
  items: LineItem[]; onChange: (items: LineItem[]) => void; supplierState: string; placeOfSupply: string; showHsn?: boolean; catalog?: Item[];
}) {
  const set = (i: number, patch: Partial<LineItem>) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  /** Picking a saved item fills its HSN/SAC, rate and GST rate. */
  const setDescription = (i: number, description: string) => {
    const hit = catalog?.find((c) => c.name.toLowerCase() === description.trim().toLowerCase());
    set(i, hit ? { description: hit.name, hsn: hit.hsn ?? "", rate: hit.rate, gstRate: hit.gstRate } : { description });
  };
  const body = useRef<HTMLTableSectionElement>(null);
  /** Tally-style entry: Enter moves to the next cell; Enter on the last cell adds a row. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const fields = [...(body.current?.querySelectorAll<HTMLElement>("input, select") ?? [])];
    const at = fields.indexOf(e.target as HTMLElement);
    if (at < 0) return;
    e.preventDefault();
    if (at < fields.length - 1) fields[at + 1].focus();
    else {
      onChange([...items, emptyLine()]);
      setTimeout(() => body.current?.querySelector<HTMLElement>("tr:last-child input")?.focus(), 0);
    }
  };
  const tax = computeTax(items.filter((i) => i.qty > 0), supplierState, placeOfSupply);
  const intra = supplierState === placeOfSupply;
  return (
    <div>
      {catalog && catalog.length > 0 && (
        <datalist id="item-catalog">{catalog.map((c) => <option key={c.id} value={c.name}>{`${c.hsn ? `HSN ${c.hsn} · ` : ""}₹${c.rate} · ${c.gstRate}% GST`}</option>)}</datalist>
      )}
      <div className="overflow-hidden rounded-md border border-line">
        <div className="border-b border-line bg-canvas px-4 py-2.5 text-sm font-semibold">Item Table</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-2.5 py-2 text-left font-medium">Item details</th>
                {showHsn && <th className="w-28 border-l border-line px-2.5 py-2 text-left font-medium">HSN/SAC</th>}
                <th className="w-24 border-l border-line px-2.5 py-2 text-right font-medium">Quantity</th>
                <th className="w-32 border-l border-line px-2.5 py-2 text-right font-medium">Rate</th>
                <th className="w-28 border-l border-line px-2.5 py-2 text-left font-medium">Tax</th>
                <th className="w-32 border-l border-line px-2.5 py-2 text-right font-medium">Amount</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody ref={body} onKeyDown={onKeyDown} className="divide-y divide-line">
              {items.map((it, i) => (
                <tr key={i} className="align-top">
                  <td><input required list={catalog?.length ? "item-catalog" : undefined} value={it.description} onChange={(e) => setDescription(i, e.target.value)} placeholder={catalog?.length ? "Type or pick a saved item" : "Type the item or service"} className={cell} /></td>
                  {showHsn && <td className="border-l border-line"><input value={it.hsn ?? ""} onChange={(e) => set(i, { hsn: e.target.value })} className={cell} /></td>}
                  <td className="border-l border-line"><input type="number" min="0.01" step="0.01" required value={it.qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} className={`${cell} text-right`} /></td>
                  <td className="border-l border-line"><input type="number" min="0" step="0.01" required value={it.rate} onChange={(e) => set(i, { rate: Number(e.target.value) })} className={`${cell} text-right`} /></td>
                  <td className="border-l border-line">
                    <select value={it.gstRate} onChange={(e) => set(i, { gstRate: Number(e.target.value) })} className={cell}>
                      {GST_RATES.map((r) => <option key={r} value={r}>{intra ? `GST ${r}%` : `IGST ${r}%`}</option>)}
                    </select>
                  </td>
                  <td className="num border-l border-line px-2.5 py-2 text-right font-medium">{num(it.qty * it.rate)}</td>
                  <td className="py-2 pr-1.5 text-center">
                    {items.length > 1 && <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))} className="rounded p-0.5 text-out hover:bg-out-soft" aria-label="Remove row"><X className="size-4" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div>
          <button type="button" onClick={() => onChange([...items, emptyLine()])} className="inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-3 py-1.5 text-sm text-accent hover:bg-accent-soft"><PlusCircle className="size-4" />Add New Row</button>
        </div>
        <dl className="num space-y-2.5 rounded-md bg-canvas p-4 text-sm">
          <div className="flex justify-between font-medium"><dt>Sub Total</dt><dd>{num(tax.subtotal)}</dd></div>
          {intra ? (
            <>
              <div className="flex justify-between text-muted"><dt>CGST</dt><dd>{num(tax.cgst)}</dd></div>
              <div className="flex justify-between text-muted"><dt>SGST</dt><dd>{num(tax.sgst)}</dd></div>
            </>
          ) : <div className="flex justify-between text-muted"><dt>IGST</dt><dd>{num(tax.igst)}</dd></div>}
          <div className="flex justify-between border-t border-line pt-2.5 text-base font-semibold"><dt>Total ( ₹ )</dt><dd>{num(tax.total)}</dd></div>
          <div className="text-right text-xs text-muted">{intra ? "Intra-state supply" : "Inter-state supply"} · {STATES[supplierState] ?? "—"} → {STATES[placeOfSupply] ?? "—"}</div>
        </dl>
      </div>
    </div>
  );
}

export const totalOf = (items: LineItem[], from: string, to: string) => money(computeTax(items.filter((i) => i.qty > 0), from, to).total);
