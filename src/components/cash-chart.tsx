"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, moneyCompact } from "@/lib/format";

// Categorical slots 1 and 2 of the validated reference palette (CVD-safe pair).
export const IN_COLOR = "#2a78d6";
export const OUT_COLOR = "#eb6834";

const monthLabel = (m: string) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });

export function CashChart({ data, height = 240 }: { data: { month: string; in: number; out: number }[]; height?: number }) {
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: IN_COLOR }} />Money in</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: OUT_COLOR }} />Money out</span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v) => moneyCompact(v)} tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(v, name) => [money(Number(v)), name === "in" ? "Money in" : "Money out"]}
            labelFormatter={(m) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}
          />
          <Bar dataKey="in" fill={IN_COLOR} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          <Bar dataKey="out" fill={OUT_COLOR} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
