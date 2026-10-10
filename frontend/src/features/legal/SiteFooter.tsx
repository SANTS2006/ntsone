import { Link } from "react-router-dom";
import { Mail, Phone } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import {
  COMPANY_NAME,
  LEGAL_LINKS,
  PRODUCT_NAME,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_PHONE_LINK,
} from "@/lib/contact";

const linkClass = "text-muted-foreground transition-colors hover:text-primary";

/** The website footer: product, account, legal, and support links. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-card/40">
      <div className="site-container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1.2fr]">
        <div className="flex flex-col gap-3">
          <Link to="/" aria-label="NTSOne home" className="flex items-center gap-2 font-semibold">
            <BrandLogo className="h-9" />
            <span className="gradient-text text-lg">NTSOne</span>
          </Link>
          <p className="max-w-sm text-sm text-muted-foreground">
            The all-in-one platform for registrations, voting, orders, payments, bookkeeping and wish lists.
          </p>
        </div>

        <nav className="flex flex-col gap-2 text-sm" aria-label="Product">
          <p className="font-semibold">Product</p>
          <Link to="/#features" className={linkClass}>
            Features
          </Link>
          <Link to="/#designs" className={linkClass}>
            Designs
          </Link>
          <Link to="/#verification" className={linkClass}>
            Verification
          </Link>
          <Link to="/#security" className={linkClass}>
            Security
          </Link>
          <Link to="/#faq" className={linkClass}>
            FAQ
          </Link>
        </nav>

        <nav className="flex flex-col gap-2 text-sm" aria-label="Account">
          <p className="font-semibold">Account</p>
          <Link to="/register" className={linkClass}>
            Create an account
          </Link>
          <Link to="/login" className={linkClass}>
            Sign in
          </Link>
          <Link to="/forgot-password" className={linkClass}>
            Reset your password
          </Link>
        </nav>

        <nav className="flex flex-col gap-2 text-sm" aria-label="Legal">
          <p className="font-semibold">Legal</p>
          {LEGAL_LINKS.map((item) => (
            <Link key={item.to} to={item.to} className={linkClass}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-2 text-sm">
          <p className="font-semibold">Support</p>
          <Link to="/contact" className={linkClass}>
            Contact us
          </Link>
          <Link to="/report" className={linkClass}>
            Report a concern
          </Link>
          <a href={`mailto:${SUPPORT_EMAIL}`} className={`${linkClass} flex items-center gap-1.5 break-all`}>
            <Mail className="h-3.5 w-3.5 shrink-0" />
            {SUPPORT_EMAIL}
          </a>
          <a href={SUPPORT_PHONE_LINK} className={`${linkClass} flex items-center gap-1.5`}>
            <Phone className="h-3.5 w-3.5 shrink-0" />
            {SUPPORT_PHONE}
          </a>
        </div>
      </div>
      <div className="border-t border-border/70 px-4 py-5 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} {COMPANY_NAME}. {PRODUCT_NAME}. All rights reserved.
      </div>
    </footer>
  );
}

/**
 * The small print under forms shared with the public (the registration form and
 * its confirmation). Opens in a new tab so a half-filled form isn't lost.
 */
export function PublicFormFooter({ agreementText }: { agreementText?: string }) {
  const reportHref = `/report?link=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`;
  const small = "font-medium text-primary transition-opacity hover:opacity-80";
  return (
    <footer className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-2 px-4 pb-8 text-center text-xs leading-relaxed text-muted-foreground">
      <p>
        {agreementText ?? "By registering, you agree to the"}{" "}
        <Link to="/terms" target="_blank" rel="noopener" className={small}>
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link to="/privacy" target="_blank" rel="noopener" className={small}>
          Privacy Policy
        </Link>
        .
      </p>
      <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Link to={reportHref} target="_blank" rel="noopener" className={small}>
          Report a concern
        </Link>
        <span aria-hidden>&middot;</span>
        <Link to="/contact" target="_blank" rel="noopener" className={small}>
          Contact us
        </Link>
      </p>
      <p>
        &copy; {new Date().getFullYear()} {COMPANY_NAME}
      </p>
    </footer>
  );
}
