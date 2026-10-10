import { Loading } from "@/components/Loading";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProgramOutletContext } from "./ProgramDetailLayout";
import { useProgramStats } from "../registrations/hooks";
import { getProgramDemographics, getProgramTrend } from "../analytics/api";
import { DemographicBarChart, RegistrationTrendChart, StatusPieChart } from "../analytics/charts";
import { PaymentAnalyticsSection } from "../analytics/PaymentAnalyticsSection";
import { FieldAnalyticsSection } from "../analytics/FieldAnalyticsSection";

export function ProgramAnalyticsPage() {
  const { program, terms } = useProgramOutletContext();
  const { data: stats } = useProgramStats(program.id);
  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ["analytics", program.id, "trend"],
    queryFn: () => getProgramTrend(program.id, 30),
  });
  const { data: demographics, isLoading: demoLoading } = useQuery({
    queryKey: ["analytics", program.id, "demographics"],
    queryFn: () => getProgramDemographics(program.id),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base capitalize">{terms.plural} in the last 30 days</CardTitle>
          </CardHeader>
          <CardContent>
            {trendLoading || !trend ? (
              <Loading label="Loading trend" />
            ) : (
              <RegistrationTrendChart data={trend} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {stats ? <StatusPieChart byStatus={stats.byStatus} /> : <Loading label="Loading" />}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {demoLoading && <Loading label="Loading demographics" />}
        {!demoLoading && demographics?.length === 0 && (
          <Card className="lg:col-span-2">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No choice-based fields (gender, country, single choice, dropdown, yes/no) found on the published form
              yet. Add one to see a breakdown here.
            </CardContent>
          </Card>
        )}
        {demographics?.map((breakdown) => (
          <Card key={breakdown.fieldKey}>
            <CardHeader>
              <CardTitle className="text-base">{breakdown.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <DemographicBarChart breakdown={breakdown} />
            </CardContent>
          </Card>
        ))}
      </div>

      <PaymentAnalyticsSection programId={program.id} />

      <FieldAnalyticsSection programId={program.id} />
    </div>
  );
}
