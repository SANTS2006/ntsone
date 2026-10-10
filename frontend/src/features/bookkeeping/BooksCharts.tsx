import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "@/app/ThemeContext";
import { formatMinor } from "@/lib/money";

const GREEN = "#1baf7a";
const ORANGE = "#eb6834";
const BLUE = "#2a78d6";

function useInk() {
  const { theme } = useTheme();
  return { ink: theme === "dark" ? "#c3c2b7" : "#52514e", grid: theme === "dark" ? "#2c2c2a" : "#e1e0d9" };
}

const dayLabel = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
const short = (minor: number) => {
  const value = Math.abs(minor) / 100;
  const text = value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}k` : String(Math.round(value));
  return minor < 0 ? `-${text}` : text;
};

function MoneyTooltip({ active, payload, label, currency }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string; currency: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-medium text-foreground">{formatMinor(p.value, currency)}</span>
        </p>
      ))}
    </div>
  );
}

/** Money earned and money spent, day by day. */
export function EarnedSpentChart({ earned, spent, currency, height = 240 }: { earned: { date: string; amountMinor: number }[]; spent: { date: string; amountMinor: number }[]; currency: string; height?: number }) {
  const { ink, grid } = useInk();
  const data = earned.map((e, i) => ({ label: dayLabel(e.date), Earned: e.amountMinor, Spent: spent[i]?.amountMinor ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="earnedFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GREEN} stopOpacity={0.35} />
            <stop offset="100%" stopColor={GREEN} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="spentFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ORANGE} stopOpacity={0.3} />
            <stop offset="100%" stopColor={ORANGE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: ink, fontSize: 11 }} axisLine={{ stroke: grid }} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={short} tick={{ fill: ink, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<MoneyTooltip currency={currency} />} />
        <Legend formatter={(value) => <span style={{ color: ink, fontSize: 12 }}>{value}</span>} />
        <Area type="monotone" dataKey="Earned" stroke={GREEN} strokeWidth={2} fill="url(#earnedFill)" />
        <Area type="monotone" dataKey="Spent" stroke={ORANGE} strokeWidth={2} fill="url(#spentFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Month by month: what came in, what went out, and the result. */
export function MonthlyChart({ rows, currency, height = 260 }: { rows: { month: string; earned: number; spent: number }[]; currency: string; height?: number }) {
  const { ink, grid } = useInk();
  const data = rows.map((r) => ({ label: monthLabel(r.month), Earned: r.earned, Spent: r.spent }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: ink, fontSize: 11 }} axisLine={{ stroke: grid }} tickLine={false} />
        <YAxis tickFormatter={short} tick={{ fill: ink, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
        <Tooltip content={<MoneyTooltip currency={currency} />} cursor={{ fill: "transparent" }} />
        <Legend formatter={(value) => <span style={{ color: ink, fontSize: 12 }}>{value}</span>} />
        <Bar dataKey="Earned" fill={GREEN} radius={[4, 4, 0, 0]} />
        <Bar dataKey="Spent" fill={ORANGE} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** A row of bars, one per category, each as long as its share of the biggest. */
export function CategoryBars({ rows, currency, tone = BLUE }: { rows: { category: string; totalMinor: number }[]; currency: string; tone?: string }) {
  const peak = Math.max(1, ...rows.map((r) => r.totalMinor));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div key={row.category} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{row.category}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{formatMinor(row.totalMinor, currency)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, (row.totalMinor / peak) * 100)}%`, backgroundColor: tone }} />
          </div>
        </div>
      ))}
    </div>
  );
}
