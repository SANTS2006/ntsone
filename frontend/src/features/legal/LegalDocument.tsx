import * as React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LEGAL_LAST_UPDATED, LEGAL_LINKS, SUPPORT_EMAIL } from "@/lib/contact";
import { usePageMeta } from "@/lib/seo";

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

/** Text styles for a legal page's body copy. */
export const prose =
  "flex flex-col gap-3 text-[15px] leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-primary [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:ml-5 [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1.5";

export function PageHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro?: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b border-border/70">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[720px] -translate-x-1/2 rounded-full bg-gradient-brand opacity-[0.12] blur-3xl" />
      <div className="site-container relative flex flex-col gap-3 py-14 sm:py-16">
        <span className="w-fit rounded-full bg-gradient-brand-soft px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
          {eyebrow}
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
        {intro && <div className="max-w-2xl text-base text-muted-foreground sm:text-lg">{intro}</div>}
      </div>
    </section>
  );
}

/** A legal page: title, last-updated date, contents list, numbered sections, and links to the other policies. */
export function LegalDocument({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: React.ReactNode;
  sections: LegalSection[];
}) {
  usePageMeta({ title, description: `${title} for NTSOne by NTS Digital Solutions.`, index: true });

  return (
    <>
      <PageHero eyebrow="Legal" title={title} intro={<p>Last updated: {LEGAL_LAST_UPDATED}</p>} />
      <div className="site-container grid gap-10 py-12 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">On this page</p>
          <ol className="flex flex-col gap-1.5 text-sm">
            {sections.map((section, i) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-muted-foreground transition-colors hover:text-primary">
                  {i + 1}. {section.title}
                </a>
              </li>
            ))}
          </ol>
          <div className="mt-8 hidden flex-col gap-1.5 border-t border-border/70 pt-6 text-sm lg:flex">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Other policies</p>
            {LEGAL_LINKS.filter((l) => l.label !== title).map((l) => (
              <Link key={l.to} to={l.to} className="text-muted-foreground transition-colors hover:text-primary">
                {l.label}
              </Link>
            ))}
          </div>
        </aside>

        <article className="flex flex-col gap-10">
          <div className={prose}>{intro}</div>
          {sections.map((section, i) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="mb-3 text-xl font-bold tracking-tight">
                {i + 1}. {section.title}
              </h2>
              <div className={cn(prose)}>{section.body}</div>
            </section>
          ))}
          <div className="rounded-2xl border border-border/70 bg-card/60 p-5 text-sm text-muted-foreground">
            Questions about this policy? Email{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-primary">
              {SUPPORT_EMAIL}
            </a>{" "}
            or visit our{" "}
            <Link to="/contact" className="font-medium text-primary">
              contact page
            </Link>
            .
          </div>
        </article>
      </div>
    </>
  );
}
