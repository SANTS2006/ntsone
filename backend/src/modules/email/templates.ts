import { env } from "../../config/env.js";

// Email clients ignore <style> blocks and CSS variables inconsistently, so every
// style here is inline, layout is table-based, and each gradient has a solid
// background-color fallback (Outlook desktop doesn't render gradients).
const BRAND = {
  gradient: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #0ea5e9 100%)",
  primary: "#2563eb",
  primaryDark: "#1d4ed8",
  heading: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  page: "#f1f5f9",
  border: "#e2e8f0",
  tint: "#eff6ff",
  tintBorder: "#bfdbfe",
};

const FONT = "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraph(html: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.body};">${html}</p>`;
}

function button(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
      <tr>
        <td style="border-radius:999px;background-color:${BRAND.primary};background-image:${BRAND.gradient};">
          <a href="${escapeHtml(url)}" target="_blank"
             style="display:inline-block;padding:14px 34px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px;">
            ${escapeHtml(label)} &rarr;
          </a>
        </td>
      </tr>
    </table>`;
}

function codeBlock(code: string): string {
  return `
    <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:28px auto 12px;">
      <tr>
        <td style="background-color:${BRAND.tint};border:1px dashed #93c5fd;border-radius:16px;padding:18px 18px 18px 30px;text-align:center;
                   font-family:${MONO};font-size:34px;font-weight:700;letter-spacing:12px;color:${BRAND.primaryDark};">
          ${escapeHtml(code)}
        </td>
      </tr>
    </table>`;
}

function detailsTable(rows: { label: string; value: string; mono?: boolean }[]): string {
  const cells = rows
    .map(
      (row, i) => `
      <tr>
        <td style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${BRAND.border};` : ""}font-family:${FONT};font-size:13px;color:${BRAND.muted};width:42%;">
          ${escapeHtml(row.label)}
        </td>
        <td style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${BRAND.border};` : ""}font-family:${row.mono ? MONO : FONT};font-size:14px;font-weight:600;color:${BRAND.heading};">
          ${escapeHtml(row.value)}
        </td>
      </tr>`,
    )
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="margin:24px 0 8px;border:1px solid ${BRAND.border};border-radius:14px;border-collapse:separate;background-color:#f8fafc;">
      ${cells}
    </table>`;
}

/** Whose email this is: the platform by default, or a poll or business with its own name and logo. */
export interface EmailBrand {
  name: string;
  logoUrl?: string | null;
  /** Replaces the "activity on your account" line at the bottom. */
  footer?: string;
}

function layout(params: { preheader: string; eyebrow: string; heading: string; body: string; brand?: EmailBrand }): string {
  const year = new Date().getFullYear();
  const brandName = params.brand?.name ?? env.EMAIL_FROM_NAME;
  const logoUrl = params.brand ? params.brand.logoUrl : `${env.APP_URL}/email-logo.png`;
  const footer =
    params.brand?.footer ??
    `You're receiving this email because of activity on your ${escapeHtml(env.EMAIL_FROM_NAME)} account.`;
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet" />
    <title>${escapeHtml(params.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${BRAND.page};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(params.preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND.page};padding:36px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 4px 18px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    ${
                      logoUrl
                        ? `<td style="vertical-align:middle;padding-right:10px;">
                      <img src="${escapeHtml(logoUrl)}" height="38" alt="${escapeHtml(brandName)}"
                           style="display:block;height:38px;max-width:120px;border:0;outline:none;" />
                    </td>`
                        : ""
                    }
                    <td style="font-family:${FONT};font-size:16px;font-weight:700;color:${BRAND.primaryDark};">
                      ${escapeHtml(brandName)}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background-color:#ffffff;border:1px solid ${BRAND.border};border-radius:22px;overflow:hidden;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background-color:${BRAND.primary};background-image:${BRAND.gradient};padding:34px 40px 30px;border-radius:22px 22px 0 0;">
                      <span style="display:inline-block;padding:5px 12px;border-radius:999px;background-color:rgba(255,255,255,0.18);
                                   font-family:${FONT};font-size:11px;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:#ffffff;">
                        ${escapeHtml(params.eyebrow)}
                      </span>
                      <h1 style="margin:14px 0 0;font-family:${FONT};font-size:26px;line-height:1.3;font-weight:800;color:#ffffff;">
                        ${escapeHtml(params.heading)}
                      </h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:34px 40px 32px;">
                      ${params.body}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 16px 0;text-align:center;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.faint};">
                ${footer}<br />
                &copy; ${year} ${escapeHtml(brandName)}. All rights reserved.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export const VERIFICATION_CODE_TTL_MINUTES = 15;

export function verificationCodeEmail(params: {
  name: string;
  code: string;
  purpose: "signup" | "email_change";
}): { subject: string; html: string } {
  const isSignup = params.purpose === "signup";
  const subject = isSignup ? "Verify your email address" : "Confirm your new email address";
  const intro = isSignup
    ? "Welcome aboard! To finish setting up your account, enter the verification code below on the verification screen."
    : "You asked to change the email address on your account. Enter the code below to confirm this new address.";

  const body = [
    paragraph(`Hi <strong style="color:${BRAND.heading};">${escapeHtml(params.name)}</strong>,`),
    paragraph(intro),
    codeBlock(params.code),
    `<p style="margin:0 0 24px;text-align:center;font-family:${FONT};font-size:13px;color:${BRAND.muted};">
       This code expires in <strong>${VERIFICATION_CODE_TTL_MINUTES} minutes</strong>.
     </p>`,
    `<div style="border-top:1px solid ${BRAND.border};padding-top:20px;">
       <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};">
         Didn't request this? You can safely ignore this email. ${
           isSignup ? "No account will be activated" : "Your email address won't change"
         } without this code. Never share this code with anyone.
       </p>
     </div>`,
  ].join("");

  return {
    subject,
    html: layout({
      preheader: `Your verification code is ${params.code}`,
      eyebrow: isSignup ? "Email verification" : "Email change",
      heading: isSignup ? "Verify your email address" : "Confirm your new email",
      body,
    }),
  };
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  program_admin: "Program Admin",
  viewer: "Viewer",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/** Sent when someone is given access to a program, poll, or business (a temporary password only for brand-new accounts). */
export function resourceAccessEmail(params: {
  name: string;
  email: string;
  inviterName: string;
  resourceLabel: string;
  resourceName: string;
  role: string;
  temporaryPassword: string | null;
  url: string;
}): { subject: string; html: string } {
  const role = roleLabel(params.role === "admin" ? "program_admin" : "viewer");
  const strong = (value: string) => `<strong style="color:${BRAND.heading};">${escapeHtml(value)}</strong>`;
  const body = [
    paragraph(`Hi ${strong(params.name)},`),
    paragraph(
      `${strong(params.inviterName)} has given you ${params.role === "admin" ? "admin" : "viewer"} access to the ${escapeHtml(params.resourceLabel)} ${strong(params.resourceName)}.`,
    ),
    detailsTable([
      { label: params.resourceLabel[0]!.toUpperCase() + params.resourceLabel.slice(1), value: params.resourceName },
      { label: "Your access", value: params.role === "admin" ? "Admin: can manage it" : "Viewer: can see it" },
      { label: "Sign-in email", value: params.email },
      ...(params.temporaryPassword ? [{ label: "Temporary password", value: params.temporaryPassword, mono: true }] : []),
    ]),
    paragraph(
      params.temporaryPassword
        ? "We also made you a space of your own, where you can create your own programs, voting polls and businesses and invite others. Sign in with the details above, then change your password in Settings."
        : "It now appears in your account next to anything you've created yourself.",
    ),
    button(params.temporaryPassword ? "Sign in" : "Open it", params.url),
  ].join("");
  void role;
  return {
    subject: `${params.inviterName} gave you access to ${params.resourceName}`,
    html: layout({
      preheader: `You now have ${params.role} access to ${params.resourceName}`,
      eyebrow: "You've been given access",
      heading: params.resourceName,
      body,
    }),
  };
}

/** Sent to someone who already has an account when they are added to a team. */
export function teamAddedEmail(params: { name: string; inviterName: string; organizationName: string; role: string; loginUrl: string }): { subject: string; html: string } {
  const role = roleLabel(params.role);
  const strong = (value: string) => `<strong style="color:${BRAND.heading};">${escapeHtml(value)}</strong>`;
  const body = [
    paragraph(`Hi ${strong(params.name)},`),
    paragraph(`${strong(params.inviterName)} has added you to the team at ${strong(params.organizationName)} as a ${strong(role)}.`),
    paragraph("Whatever they share with you will show up in your account next to everything you've created yourself."),
    button("Sign in", params.loginUrl),
  ].join("");
  return {
    subject: `You've been added to ${params.organizationName}`,
    html: layout({ preheader: `You're now on the team at ${params.organizationName}`, eyebrow: "You've been added to a team", heading: params.organizationName, body }),
  };
}

export function invitationEmail(params: {
  name: string;
  email: string;
  inviterName: string;
  organizationName: string;
  role: string;
  temporaryPassword: string;
  loginUrl: string;
}): { subject: string; html: string } {
  const role = roleLabel(params.role);
  const subject = `You've been invited to join ${params.organizationName}`;

  const body = [
    paragraph(`Hi <strong style="color:${BRAND.heading};">${escapeHtml(params.name)}</strong>,`),
    paragraph(
      `<strong style="color:${BRAND.heading};">${escapeHtml(params.inviterName)}</strong> has invited you to join
       <strong style="color:${BRAND.heading};">${escapeHtml(params.organizationName)}</strong> as a
       <strong style="color:${BRAND.primaryDark};">${escapeHtml(role)}</strong>.`,
    ),
    paragraph("Use the details below to sign in for the first time:"),
    detailsTable([
      { label: "Organization", value: params.organizationName },
      { label: "Your role", value: role },
      { label: "Sign-in email", value: params.email },
      { label: "Temporary password", value: params.temporaryPassword, mono: true },
    ]),
    paragraph(`Confirm your invitation by clicking the button below. It takes you straight to the sign-in page.`),
    button("Confirm & sign in", params.loginUrl),
    `<div style="margin-top:20px;border-top:1px solid ${BRAND.border};padding-top:20px;">
       <p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};">
         For your security, change this temporary password from <strong>Settings</strong> right after you sign in.
       </p>
       <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.faint};word-break:break-all;">
         Button not working? Paste this link into your browser: ${escapeHtml(params.loginUrl)}
       </p>
     </div>`,
  ].join("");

  return {
    subject,
    html: layout({
      preheader: `${params.inviterName} invited you to ${params.organizationName} as ${role}.`,
      eyebrow: "Team invitation",
      heading: `You're invited to ${params.organizationName}`,
      body,
    }),
  };
}

export const PASSWORD_RESET_TTL_MINUTES = 10;

export function passwordResetEmail(resetUrl: string): { subject: string; html: string } {
  const body = [
    paragraph("We received a request to reset the password for your account."),
    paragraph(
      `Click the button below to choose a new password. For your security, this link expires in <strong>${PASSWORD_RESET_TTL_MINUTES} minutes</strong>.`,
    ),
    button("Reset password", resetUrl),
    `<div style="margin-top:20px;border-top:1px solid ${BRAND.border};padding-top:20px;">
       <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};">
         If you didn't request a password reset, you can safely ignore this email. Your password won't change.
       </p>
     </div>`,
  ].join("");

  return {
    subject: "Reset your password",
    html: layout({ preheader: "Reset your password", eyebrow: "Account security", heading: "Reset your password", body }),
  };
}

export function passwordChangedEmail(params: { name: string; loginUrl: string }): { subject: string; html: string } {
  const body = [
    paragraph(`Hi <strong style="color:${BRAND.heading};">${escapeHtml(params.name)}</strong>,`),
    paragraph("Your password was reset successfully. You can now sign in with your new password."),
    paragraph("For your security, you've been signed out of all other devices."),
    button("Sign in", params.loginUrl),
    `<div style="margin-top:20px;border-top:1px solid ${BRAND.border};padding-top:20px;">
       <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${BRAND.muted};">
         Didn't make this change? Reset your password again straight away and contact your administrator.
       </p>
     </div>`,
  ].join("");

  return {
    subject: "Your password has been changed",
    html: layout({
      preheader: "Your password was reset successfully.",
      eyebrow: "Account security",
      heading: "Password changed",
      body,
    }),
  };
}

export function registrationConfirmationEmail(params: {
  programName: string;
  registrationNumber: string;
  applicantName: string;
}): string {
  const body = [
    paragraph(`Hi <strong style="color:${BRAND.heading};">${escapeHtml(params.applicantName)}</strong>,`),
    paragraph(
      `Thank you for registering for <strong style="color:${BRAND.heading};">${escapeHtml(params.programName)}</strong>. We've received your submission.`,
    ),
    detailsTable([
      { label: "Program", value: params.programName },
      { label: "Registration number", value: params.registrationNumber, mono: true },
    ]),
    paragraph("Please keep your registration number for your records."),
  ].join("");

  return layout({
    preheader: `Your registration number is ${params.registrationNumber}`,
    eyebrow: "Registration received",
    heading: "You're registered!",
    body,
  });
}

export function reportEmail(params: {
  category: string;
  name?: string;
  email: string;
  link?: string;
  message: string;
  submittedAt: Date;
  ipAddress?: string;
}): { subject: string; html: string } {
  const message = escapeHtml(params.message).replace(/\r?\n/g, "<br />");
  const body = [
    paragraph("A new report was submitted through the report form on the website."),
    detailsTable([
      { label: "Category", value: params.category },
      { label: "Name", value: params.name || "Not given" },
      { label: "Email", value: params.email },
      ...(params.link ? [{ label: "Link or program", value: params.link }] : []),
      { label: "Submitted", value: params.submittedAt.toUTCString() },
      ...(params.ipAddress ? [{ label: "IP address", value: params.ipAddress, mono: true }] : []),
    ]),
    `<div style="margin-top:20px;border-left:3px solid ${BRAND.border};padding:4px 0 4px 16px;">
       <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.body};">${message}</p>
     </div>`,
    paragraph(`<span style="color:${BRAND.muted};font-size:13px;">Reply to this email to answer the person who sent the report.</span>`),
  ].join("");

  return {
    subject: `New report: ${params.category}`,
    html: layout({ preheader: `New report: ${params.category}`, eyebrow: "Report form", heading: "New report received", body }),
  };
}

export function contactMessageEmail(params: {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  submittedAt: Date;
}): { subject: string; html: string } {
  const message = escapeHtml(params.message).replace(/\r?\n/g, "<br />");
  const body = [
    paragraph("A new message was sent through the contact form on the website."),
    detailsTable([
      { label: "Name", value: params.name },
      { label: "Email", value: params.email },
      ...(params.phone ? [{ label: "Phone", value: params.phone }] : []),
      { label: "Subject", value: params.subject },
      { label: "Sent", value: params.submittedAt.toUTCString() },
    ]),
    `<div style="margin-top:20px;border-left:3px solid ${BRAND.border};padding:4px 0 4px 16px;">
       <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.body};">${message}</p>
     </div>`,
    paragraph(`<span style="color:${BRAND.muted};font-size:13px;">Reply to this email to answer ${escapeHtml(params.name)} directly.</span>`),
  ].join("");

  return {
    subject: `Contact form: ${params.subject}`,
    html: layout({ preheader: `Message from ${params.name}`, eyebrow: "Contact form", heading: "New message received", body }),
  };
}

export function feedbackEmail(params: {
  category: string;
  subject: string;
  message: string;
  name: string;
  email: string;
  organizationName?: string;
  programName?: string;
  submittedAt: Date;
}): { subject: string; html: string } {
  const message = escapeHtml(params.message).replace(/\r?\n/g, "<br />");
  const body = [
    paragraph("New feedback was sent from inside the platform."),
    detailsTable([
      { label: "Type", value: params.category },
      { label: "Subject", value: params.subject },
      { label: "From", value: `${params.name} (${params.email})` },
      ...(params.organizationName ? [{ label: "Account", value: params.organizationName }] : []),
      ...(params.programName ? [{ label: "Program", value: params.programName }] : []),
      { label: "Sent", value: params.submittedAt.toUTCString() },
    ]),
    `<div style="margin-top:20px;border-left:3px solid ${BRAND.border};padding:4px 0 4px 16px;">
       <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.body};">${message}</p>
     </div>`,
    paragraph(`<span style="color:${BRAND.muted};font-size:13px;">Reply to this email to answer ${escapeHtml(params.name)} directly.</span>`),
  ].join("");

  return {
    subject: `Feedback (${params.category}): ${params.subject}`,
    html: layout({ preheader: `Feedback from ${params.name}`, eyebrow: "Platform feedback", heading: "New feedback received", body }),
  };
}

/** "29 Sep 2026, 14:05 UTC" */
function formatWhen(date: Date): string {
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${day}, ${time} UTC`;
}

function mutedNote(html: string): string {
  return paragraph(`<span style="color:${BRAND.muted};font-size:13px;">${html}</span>`);
}

function turnOffNote(programName: string, settingsUrl: string, lead: string): string {
  return mutedNote(
    `${lead} Program admins can turn these emails off under <a href="${escapeHtml(settingsUrl)}" style="color:${BRAND.primary};">Email notifications</a> on the ${escapeHtml(programName)} overview page.`,
  );
}

export function newRegistrationNotificationEmail(params: {
  programName: string;
  registrationNumber: string;
  applicantName?: string | null;
  submittedAt: Date;
  answers: { label: string; value: string }[];
  detailsUrl: string;
  settingsUrl: string;
  /** A business order rather than a program registration. */
  isOrder?: boolean;
}): { subject: string; html: string } {
  const who = params.applicantName || "Someone";
  const noun = params.isOrder ? "order" : "registration";
  const strong = (value: string) => `<strong style="color:${BRAND.heading};">${escapeHtml(value)}</strong>`;
  const body = [
    paragraph(params.isOrder ? `${strong(who)} just placed an order through ${strong(params.programName)}.` : `${strong(who)} just registered for ${strong(params.programName)}.`),
    detailsTable([
      { label: params.isOrder ? "Order number" : "Registration number", value: params.registrationNumber, mono: true },
      { label: "Submitted", value: formatWhen(params.submittedAt) },
      ...params.answers,
    ]),
    button(`Open the ${noun}`, params.detailsUrl),
    params.isOrder
      ? mutedNote(
          `You're getting this because you're on this business's team. Admins can turn these emails off on the business's <a href="${escapeHtml(params.settingsUrl)}" style="color:${BRAND.primary};">overview page</a>.`,
        )
      : turnOffNote(params.programName, params.settingsUrl, "You're getting this because you're on this program's team."),
  ].join("");

  return {
    subject: `New ${noun}: ${who} - ${params.programName}`,
    html: layout({
      preheader: params.isOrder ? `${who} placed an order (${params.registrationNumber})` : `${who} registered (${params.registrationNumber})`,
      eyebrow: `New ${noun}`,
      heading: `New ${noun} received`,
      body,
    }),
  };
}

export function documentVerifiedNotificationEmail(params: {
  programName: string;
  documentLabel: string;
  registrationNumber: string;
  applicantName?: string | null;
  valid: boolean;
  status: string;
  verifiedAt: Date;
  verifiedBy: string;
  detailsUrl: string;
  settingsUrl: string;
}): { subject: string; html: string } {
  const who = params.applicantName || params.registrationNumber;
  const strong = (value: string) => `<strong style="color:${BRAND.heading};">${escapeHtml(value)}</strong>`;
  const body = [
    paragraph(
      params.valid
        ? `The ${escapeHtml(params.documentLabel.toLowerCase())} for ${strong(who)} was scanned and verified for ${strong(params.programName)}.`
        : `The ${escapeHtml(params.documentLabel.toLowerCase())} for ${strong(who)} was scanned for ${strong(params.programName)}, but it is <strong style="color:#b91c1c;">not valid</strong> because the registration is ${escapeHtml(params.status)}.`,
    ),
    detailsTable([
      { label: "Result", value: params.valid ? "Valid" : `Not valid (${params.status})` },
      { label: "Document", value: params.documentLabel },
      ...(params.applicantName ? [{ label: "Name", value: params.applicantName }] : []),
      { label: "Registration number", value: params.registrationNumber, mono: true },
      { label: "Checked in", value: formatWhen(params.verifiedAt) },
      { label: "Scanned by", value: params.verifiedBy },
    ]),
    button("Open the registration", params.detailsUrl),
    turnOffNote(params.programName, params.settingsUrl, "Only the first scan of each ID card or ticket sends an email."),
  ].join("");

  const result = params.valid ? "verified" : "NOT VALID";
  return {
    subject: `${params.documentLabel} ${result}: ${who} - ${params.programName}`,
    html: layout({
      preheader: `${params.documentLabel} ${result} for ${who}`,
      eyebrow: params.valid ? "Check-in" : "Check-in warning",
      heading: params.valid ? `${params.documentLabel} verified` : `${params.documentLabel} not valid`,
      body,
    }),
  };
}

/** A Cloudinary image as a small PNG, which every email client can show (Outlook can't show WebP). */
export function emailImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.includes("/image/upload/") ? url.replace("/image/upload/", "/image/upload/c_limit,h_120,f_png/") : url;
}

export function voterCodeEmail(params: {
  pollName: string;
  pollImageUrl?: string | null;
  name: string;
  code: string;
  purpose?: "confirm" | "reset";
}): {
  subject: string;
  html: string;
} {
  const reset = params.purpose === "reset";
  const body = [
    paragraph(`Hi <strong style="color:${BRAND.heading};">${escapeHtml(params.name)}</strong>,`),
    paragraph(
      reset
        ? `Enter this code to choose a new password for your voter account in <strong style="color:${BRAND.heading};">${escapeHtml(params.pollName)}</strong>.`
        : `Enter this code to confirm your email address and start voting in <strong style="color:${BRAND.heading};">${escapeHtml(params.pollName)}</strong>.`,
    ),
    codeBlock(params.code),
    `<p style="margin:0 0 24px;text-align:center;font-family:${FONT};font-size:13px;color:${BRAND.muted};">
       This code expires in <strong>${VERIFICATION_CODE_TTL_MINUTES} minutes</strong>.
     </p>`,
    mutedNote(
      reset
        ? "Didn't ask to reset your password? You can ignore this email. Never share this code with anyone."
        : "Didn't try to vote? You can ignore this email. Never share this code with anyone.",
    ),
  ].join("");
  return {
    subject: reset ? `Reset your password for ${params.pollName}` : `Your voting code for ${params.pollName}`,
    html: layout({
      preheader: `Your code is ${params.code}`,
      eyebrow: reset ? "Reset your password" : "Confirm your email",
      heading: reset ? "Your reset code" : "Your voting code",
      body,
      brand: {
        name: params.pollName,
        logoUrl: emailImageUrl(params.pollImageUrl),
        footer: `You're receiving this email because this address was used to sign in to vote in ${escapeHtml(params.pollName)}.`,
      },
    }),
  };
}

export function newVoteNotificationEmail(params: {
  pollName: string;
  voterName: string;
  voterEmail: string;
  positionTitle: string;
  votedAt: Date;
  totalVotesForPosition: number;
  resultsUrl: string;
  settingsUrl: string;
}): { subject: string; html: string } {
  const strong = (value: string) => `<strong style="color:${BRAND.heading};">${escapeHtml(value)}</strong>`;
  const body = [
    paragraph(`${strong(params.voterName)} voted for ${strong(params.positionTitle)} in ${strong(params.pollName)}.`),
    detailsTable([
      { label: "Voter", value: `${params.voterName} (${params.voterEmail})` },
      { label: "Position", value: params.positionTitle },
      { label: "Voted", value: formatWhen(params.votedAt) },
      { label: "Votes for this position so far", value: String(params.totalVotesForPosition) },
    ]),
    button("See the live results", params.resultsUrl),
    mutedNote(
      `Ballots are secret, so this email doesn't say who they chose. Poll admins can turn these emails off under <a href="${escapeHtml(params.settingsUrl)}" style="color:${BRAND.primary};">Settings</a> on the poll.`,
    ),
  ].join("");
  return {
    subject: `New vote: ${params.positionTitle} - ${params.pollName}`,
    html: layout({
      preheader: `${params.voterName} voted for ${params.positionTitle}`,
      eyebrow: "New vote",
      heading: "A new vote was cast",
      body,
    }),
  };
}

// ---------------------------------------------------------------------------
// Business emails: branded with the business's own name and logo.

export interface BusinessEmailBrand {
  name: string;
  logoUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  brandColor?: string;
}

function businessBrand(business: BusinessEmailBrand, footer: string): EmailBrand {
  return { name: business.name, logoUrl: emailImageUrl(business.logoUrl), footer };
}

function businessContactLine(business: BusinessEmailBrand) {
  const parts = [business.phone, business.email].filter(Boolean).map((v) => escapeHtml(v!));
  return parts.length ? mutedNote(`Questions? Contact ${escapeHtml(business.name)} at ${parts.join(" or ")}.`) : "";
}

export function businessDocumentEmail(params: {
  kind: "invoice" | "receipt" | "quotation";
  business: BusinessEmailBrand;
  clientName: string;
  number: string;
  issueDate: string;
  dueDate: string | null;
  total: string;
  balance: string | null;
  updated: boolean;
  message?: string;
}): { subject: string; html: string } {
  const label = params.kind === "invoice" ? "Invoice" : params.kind === "quotation" ? "Quotation" : "Receipt";
  const strong = (value: string) => `<strong style="color:${BRAND.heading};">${escapeHtml(value)}</strong>`;
  const body = [
    paragraph(`Hi ${strong(params.clientName)},`),
    params.message
      ? paragraph(escapeHtml(params.message).replace(/\r?\n/g, "<br />"))
      : paragraph(
          params.kind === "invoice"
            ? `Please find ${params.updated ? "the updated" : "your"} invoice ${strong(params.number)} from ${strong(params.business.name)} attached.`
            : params.kind === "quotation"
              ? `Thank you for your interest. Please find ${params.updated ? "the updated" : "your"} quotation ${strong(params.number)} from ${strong(params.business.name)} attached.`
              : `Thank you for your payment. Your ${params.updated ? "updated " : ""}receipt ${strong(params.number)} from ${strong(params.business.name)} is attached.`,
        ),
    detailsTable([
      { label: `${label} number`, value: params.number, mono: true },
      { label: "Date", value: params.issueDate },
      ...(params.dueDate ? [{ label: params.kind === "quotation" ? "Valid until" : "Due date", value: params.dueDate }] : []),
      { label: "Total", value: params.total },
      ...(params.balance ? [{ label: "Amount due", value: params.balance }] : []),
    ]),
    paragraph(`The ${label.toLowerCase()} is attached to this email as a PDF.`),
    businessContactLine(params.business),
  ].join("");
  return {
    subject: `${params.updated ? "Updated " : ""}${label} ${params.number} from ${params.business.name}`,
    html: layout({
      preheader: `${label} ${params.number}: ${params.total}`,
      eyebrow: params.updated ? `Updated ${label.toLowerCase()}` : label,
      heading: `${label} ${params.number}`,
      body,
      brand: businessBrand(params.business, `You're receiving this ${label.toLowerCase()} from ${escapeHtml(params.business.name)}.`),
    }),
  };
}

/** A business card, sent as a PDF attachment. */
export function businessCardEmail(params: {
  business: BusinessEmailBrand;
  recipientName?: string | null;
  cardName: string;
  cardTitle?: string | null;
  message?: string;
}): { subject: string; html: string } {
  const strong = (value: string) => `<strong style="color:${BRAND.heading};">${escapeHtml(value)}</strong>`;
  const body = [
    paragraph(`Hi ${params.recipientName ? strong(params.recipientName) : "there"},`),
    params.message
      ? paragraph(escapeHtml(params.message).replace(/\r?\n/g, "<br />"))
      : paragraph(`Please find the business card of ${strong(params.cardName)}${params.cardTitle ? `, ${escapeHtml(params.cardTitle)}` : ""} at ${strong(params.business.name)} attached.`),
    paragraph("The card is attached to this email as a PDF with its front and back."),
    businessContactLine(params.business),
  ].join("");
  return {
    subject: `${params.cardName} - business card from ${params.business.name}`,
    html: layout({
      preheader: `The business card of ${params.cardName}`,
      eyebrow: "Business card",
      heading: params.cardName,
      body,
      brand: businessBrand(params.business, `You're receiving this card from ${escapeHtml(params.business.name)}.`),
    }),
  };
}

const ORDER_STATUS_TEXT: Record<string, { label: string; line: string }> = {
  submitted: { label: "Received", line: "We've received your order and will confirm it shortly." },
  confirmed: { label: "Confirmed", line: "Your order has been confirmed." },
  processing: { label: "Processing", line: "We're preparing your order." },
  ready: { label: "Ready", line: "Your order is ready for pickup or delivery." },
  delivered: { label: "Delivered", line: "Your order has been delivered." },
  completed: { label: "Completed", line: "Your order is complete. Thank you!" },
  cancelled: { label: "Cancelled", line: "Your order has been cancelled." },
  rejected: { label: "Declined", line: "Unfortunately we can't fulfil your order." },
};

export function orderStatusLabel(status: string) {
  return ORDER_STATUS_TEXT[status]?.label ?? status.replace(/_/g, " ");
}

/** Sent to the customer when they place an order, and each time its status changes. */
export function orderUpdateEmail(params: {
  business: BusinessEmailBrand;
  customerName: string;
  orderNumber: string;
  status: string;
  /** The business's own name for this status, if it has renamed it. */
  statusLabel?: string;
  note?: string | null;
  isNew: boolean;
  placedAt: Date;
  answers: { label: string; value: string }[];
}): { subject: string; html: string } {
  const known = ORDER_STATUS_TEXT[params.status];
  const label = params.statusLabel ?? known?.label ?? orderStatusLabel(params.status);
  const status = { label, line: known?.line ?? `Your order is now ${label.toLowerCase()}.` };
  const strong = (value: string) => `<strong style="color:${BRAND.heading};">${escapeHtml(value)}</strong>`;
  const body = [
    paragraph(`Hi ${strong(params.customerName)},`),
    paragraph(params.isNew ? `Thank you for your order with ${strong(params.business.name)}. ${status.line}` : status.line),
    params.note
      ? `<div style="margin:0 0 16px;border-left:3px solid ${BRAND.border};padding:4px 0 4px 16px;">
           <p style="margin:0;font-family:${FONT};font-size:14px;line-height:1.6;color:${BRAND.body};">${escapeHtml(params.note).replace(/\r?\n/g, "<br />")}</p>
         </div>`
      : "",
    detailsTable([
      { label: "Order number", value: params.orderNumber, mono: true },
      { label: "Status", value: status.label },
      { label: "Placed", value: formatWhen(params.placedAt) },
      ...params.answers,
    ]),
    businessContactLine(params.business),
  ].join("");
  return {
    subject: params.isNew
      ? `We've received your order ${params.orderNumber} - ${params.business.name}`
      : `Your order ${params.orderNumber} is ${status.label.toLowerCase()} - ${params.business.name}`,
    html: layout({
      preheader: `Order ${params.orderNumber}: ${status.label}`,
      eyebrow: params.isNew ? "Order received" : "Order update",
      heading: params.isNew ? "Thanks for your order!" : `Order ${status.label.toLowerCase()}`,
      body,
      brand: businessBrand(params.business, `You're receiving this because you placed an order with ${escapeHtml(params.business.name)}.`),
    }),
  };
}

/** Sent to the payer when their payment has been received. */
export function paymentReceivedEmail(params: {
  payerName: string;
  amount: string;
  lines: { label: string; value: string }[];
  reference: string;
}): { subject: string; html: string } {
  const body = [
    paragraph(`Hi <strong style="color:${BRAND.heading};">${escapeHtml(params.payerName)}</strong>,`),
    paragraph("We've received your payment. Thank you!"),
    detailsTable([...params.lines, { label: "Total paid", value: params.amount }, { label: "Payment reference", value: params.reference, mono: true }]),
    paragraph("Please keep this email as your receipt."),
  ].join("");
  return {
    subject: `Payment received - ${params.amount}`,
    html: layout({ preheader: `We received your payment of ${params.amount}`, eyebrow: "Payment received", heading: "Payment received", body }),
  };
}

/** A short notice about money in an organization's account: withdrawals and withdrawal accounts. */
/** A notice about the platform itself (maintenance, back online). */
export function maintenanceEmail(params: { heading: string; message: string; details: { label: string; value: string }[] }): { subject: string; html: string } {
  const body = [paragraph(escapeHtml(params.message)), params.details.length ? detailsTable(params.details) : ""].join("");
  return {
    subject: params.heading,
    html: layout({ preheader: params.message.slice(0, 90), eyebrow: "System notice", heading: params.heading, body }),
  };
}

/** An invitation to look at (or help with) someone's wish list through a private link; no account is needed. */
export function wishlistInviteEmail(params: { ownerName: string; listName: string; canEdit: boolean; url: string; recipientName: string; expiresAt: Date | null }): { subject: string; html: string } {
  const access = params.canEdit ? "view the list and make changes to it (add items, edit them and mark them as gotten)" : "view the list";
  const body = [
    paragraph(`Hello ${escapeHtml(params.recipientName)},`),
    paragraph(`${escapeHtml(params.ownerName)} has shared a wish list with you: <strong>${escapeHtml(params.listName)}</strong>. You can ${access}.`),
    paragraph("You do not need an account. Just open the link below. Keep it private: anyone who has it can open the list."),
    button("Open the wish list", params.url),
    params.expiresAt ? paragraph(`This link works until ${escapeHtml(params.expiresAt.toUTCString())}.`) : "",
    paragraph(`If you were not expecting this, you can ignore this email.`),
  ].join("");
  return {
    subject: `${params.ownerName} shared a wish list with you`,
    html: layout({ preheader: `${params.ownerName} shared "${params.listName}" with you`, eyebrow: "Wish List", heading: "A wish list was shared with you", body }),
  };
}

export function paymentsNoticeEmail(params: { heading: string; message: string; details: { label: string; value: string }[] }): { subject: string; html: string } {
  const body = [paragraph(escapeHtml(params.message)), detailsTable(params.details)].join("");
  return {
    subject: params.heading,
    html: layout({ preheader: params.message.slice(0, 90), eyebrow: "Payments", heading: params.heading, body }),
  };
}
