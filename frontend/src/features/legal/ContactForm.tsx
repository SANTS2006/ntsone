import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError } from "@/lib/api";

const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z.string().max(40).optional(),
  subject: z.string().trim().min(3, "Enter a subject").max(150),
  message: z.string().trim().min(10, "Please write at least 10 characters").max(5000),
  website: z.string().optional(),
});

type ContactValues = z.infer<typeof contactSchema>;

/** Sends a message to the support inbox; replies go straight to the sender's email. */
export function ContactForm() {
  const [sent, setSent] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactValues>({ resolver: zodResolver(contactSchema), defaultValues: { website: "" } });

  const onSubmit = async (values: ContactValues) => {
    try {
      await apiFetch("/public/contact", { method: "POST", body: values });
      setSent(true);
      reset({ website: "" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Your message could not be sent. Please try again.");
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-success text-white shadow-glow">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <h2 className="text-2xl font-semibold">Thank you, your message was sent</h2>
        <p className="max-w-md text-sm text-muted-foreground">We&apos;ll reply to the email address you gave us.</p>
        <Button variant="outline" onClick={() => setSent(false)}>
          Send another message
        </Button>
      </div>
    );
  }

  const error = (message?: string) => message && <p className="text-sm text-destructive">{message}</p>;

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div>
        <h2 className="text-xl font-bold tracking-tight">Send us a message</h2>
        <p className="mt-1 text-sm text-muted-foreground">Fill in the form and our team will get back to you.</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact-name">Your name</Label>
          <Input id="contact-name" autoComplete="name" placeholder="Enter your name" {...register("name")} />
          {error(errors.name?.message)}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact-email">Your email</Label>
          <Input id="contact-email" type="email" autoComplete="email" placeholder="Enter your email" {...register("email")} />
          {error(errors.email?.message)}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact-phone">Phone (optional)</Label>
          <Input id="contact-phone" type="tel" autoComplete="tel" placeholder="Enter your phone number" {...register("phone")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact-subject">Subject</Label>
          <Input id="contact-subject" placeholder="What is this about?" {...register("subject")} />
          {error(errors.subject?.message)}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact-message">Message</Label>
        <Textarea id="contact-message" rows={6} maxLength={5000} placeholder="How can we help?" {...register("message")} />
        {error(errors.message?.message)}
      </div>

      {/* Hidden from people; bots that fill it are ignored. */}
      <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" {...register("website")} />

      <p className="text-xs text-muted-foreground">
        We use your details only to answer your message, as described in our{" "}
        <Link to="/privacy" className="font-medium text-primary">
          Privacy Policy
        </Link>
        .
      </p>
      <Button type="submit" loading={isSubmitting} className="w-fit">
        <Send className="h-4 w-4" />
        {isSubmitting ? "Sending..." : "Send message"}
      </Button>
    </form>
  );
}
