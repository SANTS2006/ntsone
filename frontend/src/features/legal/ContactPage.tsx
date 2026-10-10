import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Flag, Mail, Phone } from "lucide-react";
import { COMPANY_NAME, COUNTRY, SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_LINK } from "@/lib/contact";
import { ContactForm } from "./ContactForm";
import { PageHero } from "./LegalDocument";
import { usePageMeta } from "@/lib/seo";

const CHANNELS = [
  {
    icon: Mail,
    title: "Email us",
    description: "Questions, account help, partnerships, or data requests.",
    value: SUPPORT_EMAIL,
    href: `mailto:${SUPPORT_EMAIL}`,
    external: true,
  },
  {
    icon: Phone,
    title: "Call us",
    description: "Speak to our team directly.",
    value: SUPPORT_PHONE,
    href: SUPPORT_PHONE_LINK,
    external: true,
  },
  {
    icon: Flag,
    title: "Report a concern",
    description: "Misuse, fraud, privacy, security, or content problems.",
    value: "Open the report form",
    href: "/report",
    external: false,
  },
];

export function ContactPage() {
  usePageMeta({
    title: "Contact us",
    description: "Questions, demos, or help with your registrations? Contact the NTSOne team at NTS Digital Solutions.",
    index: true,
  });

  return (
    <>
      <PageHero
        eyebrow="Contact"
        title="We're here to help"
        intro={
          <p>
            Reach the {COMPANY_NAME} team by email or phone. If you registered for a program, questions about your
            registration are best answered by the organization running it.
          </p>
        }
      />
      <div className="site-container grid gap-5 py-12 md:grid-cols-3">
        {CHANNELS.map((channel) => {
          const content = (
            <>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-glow">
                <channel.icon className="h-5 w-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">{channel.title}</h2>
                <p className="text-sm text-muted-foreground">{channel.description}</p>
              </div>
              <span className="mt-auto flex items-center gap-1.5 break-all text-sm font-semibold text-primary">
                {channel.value}
                <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
              </span>
            </>
          );
          const className =
            "group flex flex-col gap-4 rounded-2xl border border-border/70 bg-card/80 p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-glow";
          return channel.external ? (
            <a key={channel.title} href={channel.href} className={className}>
              {content}
            </a>
          ) : (
            <Link key={channel.title} to={channel.href} className={className}>
              {content}
            </Link>
          );
        })}
      </div>
      <div className="site-container pb-8">
        <div id="message" className="scroll-mt-24 rounded-2xl border border-border/70 bg-card p-6 shadow-sm sm:p-8">
          <ContactForm />
        </div>
      </div>
      <div className="site-container pb-16">
        <div className="rounded-2xl border border-border/70 bg-card/60 p-6 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">
            {COMPANY_NAME}, {COUNTRY}
          </p>
          <p className="mt-1">
            We aim to reply to every message within two working days. Please don&apos;t send passwords or other sensitive
            details by email. Read our <Link to="/privacy" className="font-medium text-primary">Privacy Policy</Link> to
            see how we handle your information.
          </p>
        </div>
      </div>
    </>
  );
}
