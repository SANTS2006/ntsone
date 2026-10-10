import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Send, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { PageHero } from "./LegalDocument";
import { usePageMeta } from "@/lib/seo";

const CATEGORIES = [
  { value: "abuse", label: "Abuse, harassment, or spam" },
  { value: "fraud", label: "Fraud or impersonation" },
  { value: "privacy", label: "Privacy or personal data concern" },
  { value: "security", label: "Security vulnerability" },
  { value: "content", label: "Inappropriate or illegal content" },
  { value: "technical", label: "Technical problem" },
  { value: "other", label: "Something else" },
] as const;

const reportSchema = z.object({
  name: z.string().max(120).optional(),
  email: z.string().email("Enter a valid email address"),
  category: z.enum(["abuse", "fraud", "privacy", "security", "content", "technical", "other"], {
    errorMap: () => ({ message: "Choose what the report is about" }),
  }),
  link: z.string().max(500).optional(),
  message: z.string().min(20, "Please describe what happened in at least 20 characters").max(5000),
  website: z.string().optional(),
});

type ReportForm = z.infer<typeof reportSchema>;

export function ReportPage() {
  const [params] = useSearchParams();
  const [sent, setSent] = React.useState(false);

  usePageMeta({
    title: "Report a concern",
    description: "Report a suspicious program, misuse of personal data, or a security issue on NTSOne.",
    index: true,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReportForm>({
    resolver: zodResolver(reportSchema),
    defaultValues: { link: params.get("link") ?? "", website: "" },
  });

  const onSubmit = async (values: ReportForm) => {
    try {
      await apiFetch("/public/reports", { method: "POST", body: values });
      setSent(true);
      reset({ link: "", website: "" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Your report could not be sent. Please try again.");
    }
  };

  return (
    <>
      <PageHero
        eyebrow="Report"
        title="Report a concern"
        intro={
          <p>
            Tell us about misuse, fraud, a privacy or security problem, or anything else that doesn&apos;t look right.
            Every report is read by our team.
          </p>
        }
      />
      <div className="site-container grid gap-8 py-12 lg:grid-cols-[1fr_280px]">
        <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-8">
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-success text-white shadow-glow">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <h2 className="text-2xl font-semibold">Thank you, your report was sent</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                Our team will review it and may reply to the email address you gave us.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="outline" onClick={() => setSent(false)}>
                  Send another report
                </Button>
                <Link to="/" className="inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-primary">
                  Back to home
                </Link>
              </div>
            </div>
          ) : (
            <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="report-name">Your name (optional)</Label>
                  <Input id="report-name" autoComplete="name" placeholder="Enter your name" {...register("name")} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="report-email">Your email</Label>
                  <Input id="report-email" type="email" autoComplete="email" placeholder="Enter your email" {...register("email")} />
                  {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-category">What is this about?</Label>
                <select
                  id="report-category"
                  defaultValue=""
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  {...register("category")}
                >
                  <option value="" disabled>
                    Choose a category
                  </option>
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {errors.category && <p className="text-sm text-destructive">{errors.category.message}</p>}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-link">Link, program, or account involved (optional)</Label>
                <Input id="report-link" placeholder="Paste a link or name the program" {...register("link")} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="report-message">What happened?</Label>
                <Textarea
                  id="report-message"
                  rows={6}
                  maxLength={5000}
                  placeholder="Describe the problem in as much detail as you can."
                  {...register("message")}
                />
                {errors.message && <p className="text-sm text-destructive">{errors.message.message}</p>}
              </div>

              {/* Hidden from people; bots that fill it are ignored. */}
              <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" {...register("website")} />

              <p className="text-xs text-muted-foreground">
                Your report is sent to {SUPPORT_EMAIL}. We use the details you give only to look into your report, as
                described in our{" "}
                <Link to="/privacy" className="font-medium text-primary">
                  Privacy Policy
                </Link>
                .
              </p>

              <Button type="submit" loading={isSubmitting} className="w-fit">
                <Send className="h-4 w-4" />
                {isSubmitting ? "Sending..." : "Send report"}
              </Button>
            </form>
          )}
        </div>

        <aside className="flex flex-col gap-4 text-sm text-muted-foreground">
          <div className="rounded-2xl border border-border/70 bg-card/60 p-5">
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <ShieldAlert className="h-4 w-4 text-primary" />
              In an emergency
            </p>
            <p className="mt-2">
              If someone is in immediate danger, contact your local emergency services first.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/60 p-5">
            <p className="font-semibold text-foreground">About a registration?</p>
            <p className="mt-2">
              Questions about your own registration are best answered by the organization running the program.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/60 p-5">
            <p className="font-semibold text-foreground">Other questions</p>
            <p className="mt-2">
              See our{" "}
              <Link to="/contact" className="font-medium text-primary">
                contact page
              </Link>{" "}
              for email and phone.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
