import { Loading } from "@/components/Loading";
import * as React from "react";
import { RefreshButton } from "@/components/RefreshButton";
import { Link } from "react-router-dom";
import { CalendarClock, ExternalLink, ImageIcon, Search, Users2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardInteractive } from "@/components/ui/card";
import { ProgramStatusBadge } from "@/components/StatusBadge";
import { useProgramsList } from "./hooks";
import { ProgramCreateDialog } from "./ProgramCreateDialog";
import { useAuth } from "@/app/AuthContext";
import { SharedBadge } from "../access/OwnSpace";
import { usePageMeta } from "@/lib/seo";

export function ProgramsListPage() {
  usePageMeta({ title: "Programs" });
  const { user } = useAuth();
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const { data, isLoading } = useProgramsList({ page, pageSize: 12, search: search || undefined });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Programs</h1>
          <p className="text-sm text-muted-foreground">Manage every program and its registration form.</p>
        </div>
        {user?.role !== "viewer" && <ProgramCreateDialog />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search programs..."
          className="pl-9"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>
        <RefreshButton />
      </div>

      {isLoading && <Loading label="Loading programs" />}

      {!isLoading && data?.items.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No programs yet. Create your first program to get started.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {data?.items.map((program) => (
          <Link key={program.id} to={`/admin/programs/${program.id}`}>
            <CardInteractive className="flex h-full flex-col overflow-hidden">
              <div className="relative h-36 w-full shrink-0 overflow-hidden bg-gradient-brand-soft">
                {program.thumbnailUrl ? (
                  <img src={program.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-primary/40" />
                  </div>
                )}
                <div className="absolute right-2 top-2">
                  <ProgramStatusBadge status={program.status} />
                </div>
                {program.status === "published" && (
                  <button
                    type="button"
                    title="View live registration form"
                    aria-label="View live registration form"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.open(`/programs/${program.slug}/register`, "_blank", "noopener,noreferrer");
                    }}
                    className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition-colors hover:bg-black/60"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </button>
                )}
              </div>
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 break-words text-base font-semibold leading-tight">{program.name}</h3>
                  <SharedBadge tenantId={program.tenantId} />
                </div>
                <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">
                  {program.shortDescription ?? "No description provided."}
                </p>
                <div className="flex items-center justify-between border-t border-border/60 pt-3 text-xs font-medium text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Users2 className="h-3.5 w-3.5" />
                    {program.registrationEnabled ? "Registration open" : "Registration closed"}
                  </span>
                  {program.startDate && (
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {new Date(program.startDate).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </CardContent>
            </CardInteractive>
          </Link>
        ))}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
