import { Badge } from "@/components/ui/badge";

const PROGRAM_STATUS_VARIANTS: Record<string, "secondary" | "success" | "warning" | "outline"> = {
  draft: "secondary",
  published: "success",
  closed: "warning",
  archived: "outline",
};

const REGISTRATION_STATUS_VARIANTS: Record<string, "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  submitted: "secondary",
  under_review: "warning",
  approved: "success",
  rejected: "destructive",
  waitlisted: "warning",
  cancelled: "outline",
  confirmed: "success",
  processing: "warning",
  ready: "secondary",
  delivered: "success",
  completed: "success",
};

function labelize(status: string) {
  return status
    .split("_")
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

export function ProgramStatusBadge({ status }: { status: string }) {
  return <Badge variant={PROGRAM_STATUS_VARIANTS[status] ?? "secondary"}>{labelize(status)}</Badge>;
}

export function RegistrationStatusBadge({
  status,
  label,
  tone,
}: {
  status: string;
  label?: string;
  tone?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
}) {
  return <Badge variant={tone ?? REGISTRATION_STATUS_VARIANTS[status] ?? "secondary"}>{label ?? labelize(status)}</Badge>;
}
