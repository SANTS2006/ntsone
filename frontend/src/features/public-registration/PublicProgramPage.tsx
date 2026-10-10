import { Loading } from "@/components/Loading";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { CalendarDays, Clock } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPublicProgram } from "./api";
import { usePageMeta } from "@/lib/seo";

export function PublicProgramPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: program, isLoading } = useQuery({
    queryKey: ["public-program", slug],
    queryFn: () => getPublicProgram(slug!),
    enabled: !!slug,
  });

  usePageMeta({
    title: program?.name,
    description: program ? (program.shortDescription ?? `Register for ${program.name} online.`) : undefined,
    index: !!program,
  });

  if (isLoading) return <Loading label="Loading" />;
  if (!program) return <p className="text-sm text-muted-foreground">Program not found.</p>;

  return (
    <article className="flex flex-col gap-6">
      {program.thumbnailUrl && <img src={program.thumbnailUrl} alt="" className="h-64 w-full rounded-lg object-cover" />}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{program.name}</h1>
          <Badge variant={program.registrationOpen ? "success" : "secondary"}>
            {program.registrationOpen ? "Registration Open" : "Registration Closed"}
          </Badge>
        </div>
        {program.shortDescription && <p className="text-lg text-muted-foreground">{program.shortDescription}</p>}
      </div>

      <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
        {program.startDate && (
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Starts {new Date(program.startDate).toLocaleDateString()}
          </div>
        )}
        {program.registrationEndDate && (
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Registration closes {new Date(program.registrationEndDate).toLocaleDateString()}
          </div>
        )}
      </div>

      {program.description && (
        <div className="prose max-w-none whitespace-pre-line text-sm leading-relaxed">{program.description}</div>
      )}

      <div>
        {program.registrationOpen ? (
          <Link to={`/programs/${program.slug}/register`} className={cn(buttonVariants({ size: "lg" }))}>
            Register now
          </Link>
        ) : (
          <Button size="lg" disabled>
            Registration closed
          </Button>
        )}
      </div>
    </article>
  );
}
