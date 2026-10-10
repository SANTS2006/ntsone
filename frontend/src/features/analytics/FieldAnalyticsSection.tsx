import { Loading } from "@/components/Loading";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SEQUENTIAL_BLUE } from "./palette";
import { DistributionChart } from "./charts";
import { getFieldAnalytics, type CountEntry, type FieldAnalytics } from "./api";

const TYPE_LABELS: Record<string, string> = {
  single_choice: "Single choice",
  multiple_choice: "Multiple choice",
  dropdown: "Dropdown",
  yes_no: "Yes / No",
  gender: "Gender",
  country: "Country",
  number: "Number",
  currency: "Currency",
  rating: "Rating",
  date: "Date",
  datetime: "Date & time",
  date_of_birth: "Date of birth",
  time: "Time",
  image_upload: "Image upload",
  pdf_upload: "PDF upload",
  document_upload: "Document upload",
  consent: "Consent",
};

function percent(part: number, whole: number) {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

/** Ranked list with inline magnitude bars, for free-text answers. */
function RankedList({ data, base }: { data: CountEntry[]; base: number }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <ol className="flex flex-col gap-2">
      {data.map((entry) => (
        <li key={entry.value} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate" title={entry.value}>
              {entry.value}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{entry.count}</span> · {percent(entry.count, base)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${(entry.count / max) * 100}%`, backgroundColor: SEQUENTIAL_BLUE }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/70 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function FieldBody({ field }: { field: FieldAnalytics }) {
  if (field.answered === 0 && field.kind !== "file" && field.kind !== "consent") {
    return <p className="py-6 text-center text-sm text-muted-foreground">No answers yet.</p>;
  }

  switch (field.kind) {
    case "choice":
      return (
        <div className="flex flex-col gap-4">
          {field.multiple && <p className="text-xs text-muted-foreground">Registrants could pick more than one option.</p>}
          <DistributionChart data={field.options} base={field.answered} label={field.label} kinds={["bars", "pie"]} />
          {field.otherAnswers.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">“Other” answers</p>
              <RankedList data={field.otherAnswers} base={field.answered} />
            </div>
          )}
        </div>
      );
    case "number":
      return (
        <div className="flex flex-col gap-4">
          {field.stats && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Lowest" value={field.stats.min} />
              <Stat label="Average" value={field.stats.average} />
              <Stat label="Median" value={field.stats.median} />
              <Stat label="Highest" value={field.stats.max} />
            </div>
          )}
          {field.distribution.length > 0 && <DistributionChart data={field.distribution} base={field.answered} label={field.label} kinds={["histogram", "bars", "pie"]} />}
        </div>
      );
    case "date": {
      const caption = { age: "By age group", month: "By month", hour: "By hour of day" }[field.grouping];
      return (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{caption}</p>
          <DistributionChart data={field.distribution} base={field.answered} label={field.label} kinds={["histogram", "bars", "pie"]} />
        </div>
      );
    }
    case "text":
      return (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Answers" value={field.answered} />
            <Stat label="Different answers" value={field.unique} />
          </div>
          {field.top.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Most common answers</p>
              <RankedList data={field.top} base={field.answered} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Every answer so far is different.</p>
          )}
        </div>
      );
    case "file":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Uploaded" value={field.answered} />
          <Stat label="Missing" value={field.total - field.answered} />
        </div>
      );
    case "consent":
      return (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Agreed" value={field.answered} />
          <Stat label="Did not agree" value={field.total - field.answered} />
        </div>
      );
  }
}

export function FieldAnalyticsSection({ programId }: { programId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", programId, "fields"],
    queryFn: () => getFieldAnalytics(programId),
  });

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="h-5 w-5 text-primary" />
          Field-by-field analysis
        </h2>
        <p className="text-sm text-muted-foreground">How registrants answered every question on the published form.</p>
      </div>

      {isLoading && <Loading label="Loading field analysis" />}
      {!isLoading && (data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Publish the registration form to see how registrants answer each question.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {data?.map((field) => (
          <Card key={field.fieldKey}>
            <CardHeader className="gap-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base leading-snug">{field.label}</CardTitle>
                <Badge variant="secondary" className="shrink-0">
                  {TYPE_LABELS[field.type] ?? "Text"}
                </Badge>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{field.section ?? "Registration form"}</span>
                  <span>
                    {field.answered} of {field.total} answered · {percent(field.answered, field.total)}%
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${percent(field.answered, field.total)}%`, backgroundColor: SEQUENTIAL_BLUE }}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <FieldBody field={field} />
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
