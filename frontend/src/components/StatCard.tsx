import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <Card className={cn("group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-glow", className)}>
      <CardContent className="flex items-center justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="gradient-text mt-1 break-words text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
        </div>
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md shadow-blue-500/20 transition-transform duration-200 group-hover:scale-110">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
