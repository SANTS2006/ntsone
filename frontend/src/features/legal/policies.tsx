import { Link } from "react-router-dom";
import { COMPANY_NAME, COUNTRY, PRODUCT_NAME, SUPPORT_EMAIL, SUPPORT_PHONE, SUPPORT_PHONE_LINK } from "@/lib/contact";
import { LegalDocument, type LegalSection } from "./LegalDocument";

const Email = () => <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;
const Phone = () => <a href={SUPPORT_PHONE_LINK}>{SUPPORT_PHONE}</a>;

function ContactSection() {
  return (
    <>
      <p>If you have any questions or requests, contact us:</p>
      <ul>
        <li>
          <strong>Company:</strong> {COMPANY_NAME}, {COUNTRY}
        </li>
        <li>
          <strong>Email:</strong> <Email />
        </li>
        <li>
          <strong>Phone:</strong> <Phone />
        </li>
        <li>
          <strong>Report a concern:</strong> <Link to="/report">our report form</Link>
        </li>
      </ul>
    </>
  );
}

// ---------------------------------------------------------------------------
// Terms of Service

const TERMS: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement to these terms",
    body: (
      <>
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your use of the {PRODUCT_NAME} (the &quot;Service&quot;),
          operated by {COMPANY_NAME} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By creating an account,
          submitting a registration form, or otherwise using the Service, you agree to these Terms and to our{" "}
          <Link to="/privacy">Privacy Policy</Link>. If you do not agree, do not use the Service.
        </p>
        <p>
          If you use the Service on behalf of an organization, you confirm that you are authorized to accept these Terms
          for that organization, and &quot;you&quot; includes the organization.
        </p>
      </>
    ),
  },
  {
    id: "service",
    title: "The Service",
    body: (
      <p>
        The Service lets organizations (&quot;Account Holders&quot;) create programs, build registration forms, collect
        and manage registrations, issue ID cards and tickets, and export data. People who fill in an Account
        Holder&apos;s registration form (&quot;Registrants&quot;) use the Service to submit their information to that
        Account Holder.
      </p>
    ),
  },
  {
    id: "eligibility",
    title: "Eligibility",
    body: (
      <p>
        You must be at least 18 years old, or the age of legal majority where you live, to create an account. Registrants
        under that age should only submit a form with the involvement of a parent or guardian, or where the Account
        Holder running the program has obtained the consent required by law.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "Accounts and security",
    body: (
      <ul>
        <li>Provide accurate information when you register, and keep it up to date.</li>
        <li>Keep your password confidential. You are responsible for all activity under your account.</li>
        <li>
          Tell us immediately at <Email /> if you believe your account has been accessed without your permission.
        </li>
        <li>
          Account Holders are responsible for the team members they invite and for the access they give each of them.
        </li>
      </ul>
    ),
  },
  {
    id: "your-data",
    title: "Your content and registrant data",
    body: (
      <>
        <p>
          Account Holders keep ownership of the programs, forms, designs, and registration data they create or collect
          (&quot;Your Content&quot;). You give us a limited permission to host, store, process, display, and transmit
          Your Content only as needed to provide and improve the Service and as described in our Privacy Policy.
        </p>
        <p>As an Account Holder, you are responsible for:</p>
        <ul>
          <li>Having a lawful basis, and any consent required, for the personal data you collect through your forms.</li>
          <li>Telling Registrants who you are, why you collect their data, and how you will use it.</li>
          <li>Only collecting data you need for your program, and responding to Registrants&apos; requests about their data.</li>
          <li>Making sure Your Content does not break any law or the rights of others.</li>
        </ul>
        <p>
          For registration data, we act on your behalf and follow your instructions given through the Service. We do not
          sell registration data or use it for our own marketing.
        </p>
      </>
    ),
  },
  {
    id: "registrants",
    title: "For registrants",
    body: (
      <p>
        When you submit a registration form, you are sharing your information with the organization that runs that
        program, not with {COMPANY_NAME} for its own purposes. That organization decides what it collects and how it uses
        your information. Questions about your registration, its status, or your data should go to the organization
        first. You must only submit information that is true and that you have the right to share, including any
        documents or photos you upload.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <p>
        You must follow our <Link to="/acceptable-use">Acceptable Use Policy</Link>. Among other things, you may not use
        the Service for fraud, to collect data deceptively, to send spam, to upload unlawful or harmful content, or to
        interfere with the Service or other users. You can report misuse through our <Link to="/report">report form</Link>.
      </p>
    ),
  },
  {
    id: "fees",
    title: "Fees",
    body: (
      <>
        <p>
          Building forms, taking registrations, running polls and orders, and the business tools are provided free of
          charge. We may introduce paid plans in the future. If we do, we will tell you in advance and you will not be
          charged unless you choose a paid plan.
        </p>
        <p>
          <strong>Payments.</strong> If you turn on payments for a program, order form or poll, the Service keeps a fee
          of 5% of each payment received (the &quot;Platform Fee&quot;). An administrator of your organization must agree
          to the Platform Fee before payments can be turned on, and must agree again if the fee increases. Payments are
          processed by Monime, whose own terms and charges apply separately. Money received, less the Platform Fee, is
          credited to your organization&apos;s payment fund and can be withdrawn to a mobile money number or bank account
          you add, subject to checks, limits and waiting periods described in the Service.
        </p>
        <p>
          <strong>Refunds.</strong> An organization administrator can refund a completed payment to the payer&apos;s mobile
          money number. The Platform Fee is returned in proportion to the amount refunded. You are responsible for
          checking the number you send a refund to; a refund sent to the wrong number may not be recoverable.
        </p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Availability and changes",
    body: (
      <p>
        We work to keep the Service available and secure, but we do not promise that it will be uninterrupted or free of
        errors. We may change, add, or remove features, and may carry out maintenance that temporarily affects access.
        Where a change significantly affects you, we will try to give reasonable notice.
      </p>
    ),
  },
  {
    id: "ip",
    title: "Intellectual property",
    body: (
      <p>
        The Service, including its software, design, card and ticket templates, logos, and text (excluding Your
        Content), belongs to {COMPANY_NAME} or its licensors and is protected by law. We give you a limited,
        non-exclusive, non-transferable right to use the Service under these Terms. You may use the documents the
        Service generates for your programs. You may not copy, resell, reverse engineer, or create derivative works of
        the Service itself.
      </p>
    ),
  },
  {
    id: "third-parties",
    title: "Third-party services",
    body: (
      <p>
        The Service relies on trusted providers for hosting, databases, file storage, email, and payments (Monime). Links you share, such as
        social media sharing buttons, may take users to third-party sites that have their own terms and policies. We are
        not responsible for third-party services we do not control.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Suspension and termination",
    body: (
      <>
        <p>
          You can stop using the Service at any time and may ask us to close your account by contacting <Email />.
        </p>
        <p>
          We may suspend or close an account, or remove content, if we reasonably believe it breaks these Terms or the
          law, puts other users or Registrants at risk, or exposes us to legal liability. Where appropriate, we will tell
          you why and give you a chance to respond or export your data.
        </p>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    body: (
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available&quot;. To the fullest extent permitted by law, we
        disclaim all warranties, whether express or implied, including fitness for a particular purpose and
        non-infringement. Account Holders are responsible for how they run their programs and the decisions they make
        about Registrants.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: (
      <p>
        To the fullest extent permitted by law, {COMPANY_NAME} will not be liable for any indirect, incidental, special,
        consequential, or punitive damages, or for any loss of profits, revenue, data, or goodwill, arising from your use
        of the Service. Our total liability for any claim relating to the Service is limited to the amount you paid us for
        the Service in the twelve months before the claim, or, if you paid nothing, a nominal amount. Nothing in these
        Terms limits liability that cannot be limited by law.
      </p>
    ),
  },
  {
    id: "indemnity",
    title: "Indemnity",
    body: (
      <p>
        You agree to indemnify {COMPANY_NAME} against claims, losses, and costs arising from Your Content, your
        programs, or your breach of these Terms or the law, except to the extent caused by our own breach.
      </p>
    ),
  },
  {
    id: "law",
    title: "Governing law and disputes",
    body: (
      <p>
        These Terms are governed by the laws of {COUNTRY}. If a dispute arises, please contact us first so we can try to
        resolve it informally. If it cannot be resolved, it will be subject to the jurisdiction of the courts of {COUNTRY}.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these Terms from time to time. We will change the &quot;Last updated&quot; date above and, for
        significant changes, notify Account Holders by email or in the Service. Continuing to use the Service after the
        changes take effect means you accept the updated Terms.
      </p>
    ),
  },
  { id: "contact", title: "Contact us", body: <ContactSection /> },
];

export function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      intro={
        <p>
          Please read these Terms carefully. They explain your rights and responsibilities when you use the {PRODUCT_NAME}
          , whether you run programs as an organization or register for one.
        </p>
      }
      sections={TERMS}
    />
  );
}

// ---------------------------------------------------------------------------
// Privacy Policy

const PRIVACY: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are and our role",
    body: (
      <>
        <p>
          {COMPANY_NAME} operates the {PRODUCT_NAME}. This policy explains what personal information we handle, why, and
          your choices.
        </p>
        <ul>
          <li>
            <strong>Account information:</strong> for information about Account Holders and their team members, we
            decide how it is used and are responsible for it.
          </li>
          <li>
            <strong>Registration information:</strong> for information Registrants submit through a program&apos;s form,
            the organization running that program decides what is collected and how it is used. We process it on that
            organization&apos;s behalf to provide the Service.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "information",
    title: "Information we collect",
    body: (
      <ul>
        <li>
          <strong>Account details:</strong> your name, email address, organization name, password (stored only as a
          secure hash), role, and profile preferences.
        </li>
        <li>
          <strong>Registration details:</strong> the answers Registrants give on a form, which can include names, contact
          details, dates of birth, addresses, and other information the organization asks for, plus the consent they give.
        </li>
        <li>
          <strong>Uploaded files:</strong> photos, documents, logos, and designs uploaded through the Service.
        </li>
        <li>
          <strong>Payment records:</strong> the amount, items, status and time of payments, the payer&apos;s name, email and
          phone number, and the mobile money provider used. Card or PIN details are never seen or stored by us; payments
          are made on Monime&apos;s own page. Refund and withdrawal records are kept too.
        </li>
        <li>
          <strong>Business records and voice notes:</strong> entries, loans and reports that business owners write in the
          bookkeeping section, and voice recordings they choose to save there.
        </li>
        <li>
          <strong>Wish lists:</strong> the lists, items, prices, dates and notes that a person writes in their private wish
          lists, and the record of changes to them. Only the person who made a list can see it, unless they share it: then the people they invite can open that list through a private link, with the access the owner chose, and the name the owner gave them is stored with what they change.
        </li>
        <li>
          <strong>Messages and reports:</strong> what you send us by email, phone, or the report form, including your
          contact details.
        </li>
        <li>
          <strong>Technical information:</strong> IP address, browser and device type, sign-in times, and records of
          important account and system actions (an audit log that can only be read by the platform team), kept for
          security, abuse prevention, dispute resolution, and troubleshooting. Passwords, form answers, and who a voter
          voted for are never written to it.
        </li>
      </ul>
    ),
  },
  {
    id: "use",
    title: "How we use information",
    body: (
      <ul>
        <li>To provide the Service: accounts, forms, registrations, ID cards, tickets, analytics, and exports.</li>
        <li>To send service emails such as verification codes, invitations, password resets, and registration confirmations.</li>
        <li>To keep the Service and its users secure, and to detect and prevent fraud and abuse.</li>
        <li>To respond to questions, reports, and requests.</li>
        <li>To maintain and improve the Service, and to meet our legal obligations.</li>
      </ul>
    ),
  },
  {
    id: "legal-bases",
    title: "Why we are allowed to use it",
    body: (
      <p>
        We use personal information where it is needed to provide the Service you asked for, where we have a legitimate
        interest in running a secure and reliable Service, where we have a legal obligation, or where you have given your
        consent. Organizations are responsible for having a lawful basis for the registration data they collect.
      </p>
    ),
  },
  {
    id: "sharing",
    title: "How information is shared",
    body: (
      <>
        <p>We do not sell personal information. We share it only:</p>
        <ul>
          <li>With the organization a Registrant registered with, and the team members that organization authorizes.</li>
          <li>
            With service providers that help us run the Service, for example hosting, database, file storage, and email
            delivery providers, under agreements that protect the information.
          </li>
          <li>With platform administrators at {COMPANY_NAME}, where needed to operate, support, and secure the Service.</li>
          <li>When required by law, or to protect the rights, safety, and security of our users, the public, or us.</li>
          <li>As part of a merger, acquisition, or sale of assets, with the same protections continuing to apply.</li>
        </ul>
      </>
    ),
  },
  {
    id: "transfers",
    title: "International transfers",
    body: (
      <p>
        Our service providers may store or process information in countries outside {COUNTRY}. When that happens, we use
        providers with strong security and privacy commitments to keep the information protected.
      </p>
    ),
  },
  {
    id: "retention",
    title: "How long we keep information",
    body: (
      <p>
        We keep account information for as long as the account is active. Registration information is kept for as long as
        the organization keeps it in the Service; organizations can delete programs and their data. After an account is
        closed, we delete or anonymize its data within a reasonable period, except where we must keep some records for
        legal, security, or dispute-resolution reasons.
      </p>
    ),
  },
  {
    id: "security",
    title: "How we protect information",
    body: (
      <p>
        We use encryption in transit (HTTPS), hashed passwords, short-lived sign-in sessions, email verification, role-based
        access, and separated workspaces for each organization. No system is completely secure, so please use a strong
        password and tell us straight away about any concern at <Email />.
      </p>
    ),
  },
  {
    id: "rights",
    title: "Your rights and choices",
    body: (
      <>
        <p>
          Depending on where you live, you may have the right to access, correct, delete, or receive a copy of your
          personal information, and to object to or restrict certain uses. Account Holders can update most of their
          details from their account settings.
        </p>
        <p>
          If you registered for a program, please contact the organization running it first, as it controls your
          registration. If you cannot reach them, contact us and we will help where we can. To make a request, email{" "}
          <Email />.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        Accounts are not intended for anyone under 18. Organizations running programs for younger people are responsible
        for obtaining any parental or guardian consent the law requires before collecting their information.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <p>
        We use only the cookies and browser storage needed for the Service to work, such as keeping you signed in. See our{" "}
        <Link to="/cookies">Cookie Policy</Link> for details.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We may update this policy from time to time. We will change the &quot;Last updated&quot; date above and, for
        significant changes, notify Account Holders by email or in the Service.
      </p>
    ),
  },
  { id: "contact", title: "Contact us", body: <ContactSection /> },
];

export function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      intro={
        <p>
          Your privacy matters to us. This policy covers everyone who uses the {PRODUCT_NAME}: organizations and their
          teams, and people who register for their programs.
        </p>
      }
      sections={PRIVACY}
    />
  );
}

// ---------------------------------------------------------------------------
// Cookie Policy

const COOKIES: LegalSection[] = [
  {
    id: "what",
    title: "What cookies are",
    body: (
      <p>
        Cookies are small text files a website stores in your browser. Similar technologies, such as your browser&apos;s
        local storage, work in much the same way. We refer to all of them as &quot;cookies&quot; here.
      </p>
    ),
  },
  {
    id: "we-use",
    title: "Cookies we use",
    body: (
      <>
        <p>We only use what is strictly necessary for the Service to work:</p>
        <ul>
          <li>
            <strong>Sign-in cookie (refreshToken):</strong> keeps you signed in securely. It cannot be read by scripts on
            the page, is only sent to our sign-in service, and expires after 30 days or when you sign out.
          </li>
          <li>
            <strong>Theme preference (browser storage):</strong> remembers whether you chose light or dark mode. It never
            leaves your device.
          </li>
        </ul>
        <p>We do not use advertising cookies, and we do not use cookies to track you across other websites.</p>
      </>
    ),
  },
  {
    id: "third-party",
    title: "Third-party content",
    body: (
      <p>
        Images and files uploaded to the Service are delivered by our file storage provider. When you share a program
        using a social media button, that site may set its own cookies under its own policy once you visit it.
      </p>
    ),
  },
  {
    id: "control",
    title: "Controlling cookies",
    body: (
      <p>
        You can clear or block cookies in your browser settings. Because the cookies we use are essential, blocking them
        will stop you from staying signed in, though public registration forms will still work.
      </p>
    ),
  },
  { id: "contact", title: "Contact us", body: <ContactSection /> },
];

export function CookiePolicyPage() {
  return (
    <LegalDocument
      title="Cookie Policy"
      intro={<p>This policy explains the small amount of information the {PRODUCT_NAME} stores in your browser, and why.</p>}
      sections={COOKIES}
    />
  );
}

// ---------------------------------------------------------------------------
// Acceptable Use Policy

const ACCEPTABLE_USE: LegalSection[] = [
  {
    id: "purpose",
    title: "Purpose",
    body: (
      <p>
        This policy keeps the Service safe and trustworthy for organizations and the people who register with them. It
        applies to everyone who uses the Service and forms part of our <Link to="/terms">Terms of Service</Link>.
      </p>
    ),
  },
  {
    id: "not-allowed",
    title: "What is not allowed",
    body: (
      <ul>
        <li>Creating fake programs, or impersonating a person, organization, or government body.</li>
        <li>Collecting personal information deceptively, such as phishing or asking for passwords or payment card details.</li>
        <li>Fraud, scams, or programs that charge people for something they will not receive.</li>
        <li>Uploading content that is illegal, sexually exploitative, hateful, violent, or harassing.</li>
        <li>Uploading material you do not have the right to use, or that infringes someone else&apos;s rights.</li>
        <li>Sending spam, or using forms or invitations to send unwanted messages.</li>
        <li>Uploading malware, or trying to break into, overload, scrape, or disrupt the Service.</li>
        <li>Getting around limits, access controls, or security measures, or accessing another account&apos;s data.</li>
        <li>Using the Service to break any law or regulation.</li>
      </ul>
    ),
  },
  {
    id: "responsibilities",
    title: "Organizations' responsibilities",
    body: (
      <ul>
        <li>Clearly identify your organization and explain the purpose of each program.</li>
        <li>Only ask for information you need, and use the consent statement where it is required.</li>
        <li>Keep registrant data confidential and give team members only the access they need.</li>
        <li>Respond to registrants who ask about their data or their registration.</li>
      </ul>
    ),
  },
  {
    id: "reporting",
    title: "Reporting misuse",
    body: (
      <p>
        If you see a program, form, or account that breaks this policy, or you find a security issue, please tell us
        through our <Link to="/report">report form</Link> or at <Email />. For security issues, please give us a
        reasonable chance to fix them before sharing them publicly.
      </p>
    ),
  },
  {
    id: "enforcement",
    title: "Enforcement",
    body: (
      <p>
        We may investigate suspected violations and may remove content, unpublish programs, or suspend or close accounts.
        Where we believe the law has been broken, we may report it to the relevant authorities.
      </p>
    ),
  },
  { id: "contact", title: "Contact us", body: <ContactSection /> },
];

export function AcceptableUsePage() {
  return (
    <LegalDocument
      title="Acceptable Use Policy"
      intro={<p>The rules for using the {PRODUCT_NAME} responsibly.</p>}
      sections={ACCEPTABLE_USE}
    />
  );
}
