import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@/app/ThemeContext";
import { categoricalPalette, SEQUENTIAL_BLUE, STATUS_COLORS } from "./palette";
import type { CountEntry, TrendPoint, DemographicBreakdown } from "./api";

function useChartInk() {
  const { theme } = useTheme();
  return {
    theme,
    ink: theme === "dark" ? "#c3c2b7" : "#52514e",
    grid: theme === "dark" ? "#2c2c2a" : "#e1e0d9",
    surface: theme === "dark" ? "#1a1a19" : "#fcfcfb",
  };
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs shadow-lg">
      {label && <p className="mb-1 font-medium text-foreground">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-medium text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function RegistrationTrendChart({
  data,
  height = 260,
  name = "Registrations",
  color = SEQUENTIAL_BLUE,
}: {
  data: TrendPoint[];
  height?: number;
  /** Series label in the tooltip, e.g. "Scans". */
  name?: string;
  color?: string;
}) {
  const { ink, grid } = useChartInk();
  // Unique per chart, so two trend charts on one page keep their own fills.
  const fillId = `trendFill${React.useId().replace(/:/g, "")}`;
  const chartData = data.map((d) => ({ ...d, label: formatDateLabel(d.date) }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: ink, fontSize: 11 }} axisLine={{ stroke: grid }} tickLine={false} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tick={{ fill: ink, fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="count"
          name={name}
          stroke={color}
          strokeWidth={2}
          fill={`url(#${fillId})`}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StatusPieChart({ byStatus, height = 260, labelFor }: { byStatus: Record<string, number>; height?: number; labelFor?: (status: string) => string }) {
  const { theme, ink } = useChartInk();
  const entries = Object.entries(byStatus).filter(([, count]) => count > 0);

  if (entries.length === 0) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data yet</div>;
  }

  const data = entries.map(([status, count]) => ({
    name: labelFor ? labelFor(status) : status.replace("_", " "),
    value: count,
    color: STATUS_COLORS[status]?.[theme] ?? categoricalPalette(theme)[0],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2} strokeWidth={0}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => <span style={{ color: ink, fontSize: 12, textTransform: "capitalize" }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DemographicBarChart({ breakdown }: { breakdown: DemographicBreakdown; height?: number }) {
  const total = breakdown.data.reduce((sum, d) => sum + d.count, 0);
  return <DistributionChart data={breakdown.data} base={total} label={breakdown.label} kinds={["bars", "pie"]} />;
}

export type ChartKind = "bars" | "pie" | "histogram";

const KIND_LABELS: Record<ChartKind, string> = { bars: "Bars", pie: "Pie", histogram: "Histogram" };

const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));
const clip = (text: string, max = 22) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function CountTooltip({ active, payload, base, noun }: { active?: boolean; payload?: { payload: CountEntry }[]; base: number; noun: string }) {
  const entry = payload?.[0]?.payload;
  if (!active || !entry) return null;
  return (
    <div className="max-w-[240px] rounded-lg border border-border/70 bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-0.5 font-medium text-foreground">{entry.value}</p>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{entry.count}</span> {noun}
        {entry.count === 1 ? "" : "s"} · {pct(entry.count, base)}%
      </p>
    </div>
  );
}

/** Small switch between the ways of drawing the same counts. */
function KindSwitch({ kinds, value, onChange }: { kinds: ChartKind[]; value: ChartKind; onChange: (kind: ChartKind) => void }) {
  if (kinds.length < 2) return null;
  return (
    <div role="group" aria-label="Chart type" className="inline-flex w-fit rounded-lg border border-border/70 p-0.5 text-xs">
      {kinds.map((kind) => (
        <button
          key={kind}
          type="button"
          aria-pressed={value === kind}
          onClick={() => onChange(kind)}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
            value === kind ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {KIND_LABELS[kind]}
        </button>
      ))}
    </div>
  );
}

/**
 * The same list of counts as horizontal bars, a pie, or a histogram (touching columns, for values
 * that run along a scale such as numbers, dates or ages). The person can switch between them.
 */
export function DistributionChart({
  data,
  base,
  label,
  kinds = ["bars", "pie"],
  defaultKind,
  noun = "registrant",
}: {
  data: CountEntry[];
  /** What the percentages are out of. */
  base: number;
  label: string;
  kinds?: ChartKind[];
  defaultKind?: ChartKind;
  noun?: string;
}) {
  const { theme, ink, grid } = useChartInk();
  const palette = categoricalPalette(theme);
  const [kind, setKind] = React.useState<ChartKind>(defaultKind && kinds.includes(defaultKind) ? defaultKind : kinds[0]!);
  const summary = `${label}: ${data.map((d) => `${d.value} ${d.count}`).join(", ")}`;
  const tip = <CountTooltip base={base} noun={noun} />;

  let chart: React.ReactNode;
  if (kind === "pie") {
    const slices = data.filter((d) => d.count > 0).map((d, i) => ({ ...d, name: d.value, fill: palette[i % palette.length] }));
    chart = slices.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No answers yet.</p> : (
      <ResponsiveContainer width="100%" height={Math.max(260, 220 + Math.ceil(slices.length / 2) * 12)}>
        <PieChart>
          <Pie data={slices} dataKey="count" nameKey="name" innerRadius="45%" outerRadius="75%" paddingAngle={2} strokeWidth={0}>
            {slices.map((s) => (
              <Cell key={s.value} fill={s.fill} />
            ))}
          </Pie>
          <Tooltip content={tip} />
          <Legend
            verticalAlign="bottom"
            formatter={(value) => (
              <span style={{ color: ink, fontSize: 12 }}>
                {clip(String(value), 28)} ({pct(slices.find((s) => s.value === value)?.count ?? 0, base)}%)
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    );
  } else if (kind === "histogram") {
    chart = (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} barCategoryGap={1} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
          <XAxis dataKey="value" tick={{ fill: ink, fontSize: 11 }} tickFormatter={(v: string) => clip(v, 12)} axisLine={{ stroke: grid }} tickLine={false} interval={0} />
          <YAxis allowDecimals={false} tick={{ fill: ink, fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
          <Tooltip content={tip} cursor={{ fill: grid, opacity: 0.4 }} />
          <Bar dataKey="count" fill={SEQUENTIAL_BLUE} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  } else {
    chart = (
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 30 + 24)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: ink, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="value" width={130} tick={{ fill: ink, fontSize: 11 }} tickFormatter={(v: string) => clip(v)} axisLine={false} tickLine={false} interval={0} />
          <Tooltip content={tip} cursor={{ fill: grid, opacity: 0.4 }} />
          <Bar dataKey="count" fill={SEQUENTIAL_BLUE} radius={[0, 4, 4, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <KindSwitch kinds={kinds} value={kind} onChange={setKind} />
      <div role="img" aria-label={summary}>
        {chart}
      </div>
    </div>
  );
}
