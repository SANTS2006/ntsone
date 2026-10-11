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
      <>
        <p>
          {PRODUCT_NAME} is an all-in-one platform that lets organizations and individuals run their activities from one
          place. Depending on the tools you use, the Service lets you:
        </p>
        <ul>
          <li>create programs, build registration forms, collect and manage registrations, and issue and verify ID cards and tickets;</li>
          <li>run voting polls, free or paid, with secret ballots and live results;</li>
          <li>publish order pages, take orders and manage them;</li>
          <li>
            collect payments by mobile money, hold them in a payment fund, issue refunds, and withdraw the money (see
            &quot;Payments, refunds and withdrawals&quot; below);
          </li>
          <li>create invoices, receipts and quotations, and keep business books;</li>
          <li>keep private wish lists and share them with people you choose;</li>
          <li>export your data.</li>
        </ul>
        <p>
          Organizations and individuals who open an account are &quot;Account Holders&quot;. People who use an Account
          Holder&apos;s registration form, order page, poll or payment page (&quot;Registrants&quot;, which in these Terms
          also includes customers, voters and payers) use the Service to deal with that Account Holder.
        </p>
      </>
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
          Account Holders keep ownership of the programs, polls, order pages, forms, designs, business records, wish lists, and registration data they create or collect
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
    title: "For registrants, customers, voters and payers",
    body: (
      <p>
        When you submit a registration form, place an order, vote or make a payment, you are dealing with the
        organization that runs that page, not with {COMPANY_NAME} for its own purposes. That organization decides what it
        collects, what it sells and how it uses your information. Questions about your registration, order, payment or
        data should go to the organization first. You must only submit information that is true and that you have the
        right to share, including any documents or photos you upload, and you must only pay with a mobile money account
        that you are entitled to use.
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
          <strong>Payments.</strong> If you turn on payments for a program, order page or poll, the Service keeps a fee
          of 5% of each payment received (the &quot;Platform Fee&quot;). An administrator of your organization must agree
          to the Platform Fee before payments can be turned on, and must agree again if the fee increases. Monime&apos;s own
          terms and charges apply separately. The full rules for payments, the payment fund, refunds and withdrawals are
          in the section &quot;Payments, refunds and withdrawals&quot; below.
        </p>
      </>
    ),
  },
  {
    id: "payments",
    title: "Payments, refunds and withdrawals",
    body: (
      <>
        <p>
          This section applies to every payment made through the Service, whether it is a registration fee, a charge for
          an ID card or ticket, an order, or a paid vote. It forms part of these Terms.
        </p>
        <p>
          <strong>Who you are paying.</strong> When you pay through the Service you are paying the Account Holder (the
          organization or business that set up the page), not {COMPANY_NAME}. The Account Holder is the seller. It is
          responsible for what it sells, its prices, delivering what you paid for, and its own refund and complaints
          practices. {COMPANY_NAME} provides the technology that collects, confirms and records the payment.
        </p>
        <p>
          <strong>Payment providers.</strong> Payments are processed by Monime and made by mobile money through the
          mobile network operators it supports, for example Orange Money, Africell Money and QMoney. You pay on the
          provider&apos;s own secure page. We never see or store your mobile money PIN, password or card details. The
          terms, charges, limits and availability of the provider and the network operator apply separately and are
          outside our control. Amounts are shown in Sierra Leonean Leones (NLe) unless stated otherwise.
        </p>
        <p>
          <strong>When a payment counts.</strong> A payment is treated as complete only after we have confirmed it
          directly with the payment provider and the full amount, currency and reference match. Until then it is shown
          as pending. Keep your payment confirmation page and payment number. If money has left your account but the
          payment still shows as pending or failed, wait a few minutes for it to be confirmed automatically, then contact
          the Account Holder and, if you still need help, us at <Email />, quoting your payment number.
        </p>
        <p>
          <strong>Platform Fee.</strong> The Account Holder agrees to the Platform Fee before payments can be turned on,
          and must agree again if it increases. The fee is deducted from the payments the Account Holder receives and is
          kept by us. It is not added to the price you pay. The provider&apos;s own charges, if any, are separate.
        </p>
        <p>
          <strong>Payment fund.</strong> Confirmed payments, less the Platform Fee, are credited to the Account
          Holder&apos;s payment fund. The money can be withdrawn after a short holding period that gives time to notice
          problems such as mistaken or fraudulent payments. We may extend a holding period, or hold, limit or reverse an
          amount, if we reasonably suspect fraud, a mistake or a breach of these Terms, if a provider or network operator
          reverses or disputes a payment, or where the law requires.
        </p>
        <p>
          <strong>Withdrawals.</strong> Only an organization administrator can withdraw money, to a mobile money number or
          bank account the organization has added, and must confirm with their password. A newly added withdrawal account
          waits a short time before it can be used. Withdrawals are subject to minimum amounts and daily limits, and
          larger withdrawals need review and approval by us before they are sent. We may delay, refuse or reverse a
          withdrawal for security, fraud-prevention, compliance or legal reasons. The Account Holder is responsible for
          entering the correct account; money sent to a wrong account may not be recoverable. Provider and bank charges
          may apply.
        </p>
        <p>
          <strong>Refunds.</strong> An organization administrator can refund a completed payment, in full or in part, to
          the payer&apos;s mobile money number, starting a few minutes after the payment and until a limited period
          (currently 180 days) has passed. The refund leaves the Account Holder&apos;s payment fund, the Platform Fee is
          returned in proportion to the amount refunded, and larger refunds need review and approval by us. We do not
          decide disputes between a payer and an Account Holder, but we may help, and may hold or reverse funds as
          described above. Refunds depend on the provider and network operator and may take time to arrive. Check the
          number before you send a refund: a refund sent to the wrong number may not be recoverable.
        </p>
        <p>
          <strong>Paid votes.</strong> Where a poll charges for votes, the poll&apos;s organizer sets the price per vote.
          A payment can be used once, to cast the votes it paid for. Votes that have been cast are final, are not
          refundable and cannot be moved to another payment. Paying does not guarantee any result. The organizer sees who
          paid and how many votes they bought, but never which candidate they chose.
        </p>
        <p>
          <strong>Failed, duplicate and mistaken payments.</strong> If a payment fails, no money should be taken. If you
          paid twice for the same thing, or paid the wrong amount, contact the Account Holder, who can refund the extra
          amount from their payments page.
        </p>
        <p>
          <strong>Account Holder responsibilities.</strong> Account Holders must:
        </p>
        <ul>
          <li>show clear prices and descriptions, and deliver what they charge for;</li>
          <li>handle refund requests and complaints fairly and promptly, and make their own refund policy clear to payers;</li>
          <li>keep the details of their withdrawal accounts correct, and protect the password used to confirm withdrawals;</li>
          <li>
            follow the laws that apply to their business, including consumer, tax, invoicing and anti-money-laundering
            rules, and pay any taxes due on the money they receive (the Platform Fee does not include taxes, and we do
            not collect or pay taxes on your behalf);
          </li>
          <li>not use payments for anything prohibited by our <Link to="/acceptable-use">Acceptable Use Policy</Link>.</li>
        </ul>
        <p>
          <strong>Prohibited payments.</strong> You may not use the Service to collect money for illegal goods or
          services, to launder money, to commit fraud, to take payments you do not intend to honour, or to split or
          disguise payments to avoid limits or checks. We may suspend payments, hold funds, and report suspected misuse
          to the relevant authorities.
        </p>
        <p>
          <strong>Records.</strong> We keep records of payments, refunds, withdrawals and fees (amounts, status, times, and
          the people and accounts involved) for accounting, security, dispute-resolution and legal purposes, as explained
          in our <Link to="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          <strong>Our responsibility.</strong> We work to process and record payments accurately and securely, but we rely
          on payment providers and mobile networks, which can be delayed, unavailable or make errors. Subject to the
          &quot;Limitation of liability&quot; section, we are not responsible for losses caused by provider or network
          outages or errors, by payments a user sends to a wrong number or account, or by disputes between a payer and an
          Account Holder. Nothing in these Terms limits any right you have under the law.
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
          Please read these Terms carefully. They explain your rights and responsibilities when you use {PRODUCT_NAME},
          whether you run programs, take orders or payments as an organization, or register, vote, order or pay.
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
          <li>
            <strong>Payment information:</strong> for a payment made to an organization, that organization decides what it
            is selling and why it needs the payer&apos;s details. We process the payment on its behalf, and we are
            responsible for the payment records we keep for fraud prevention, the Platform Fee, refunds, withdrawals and
            our legal obligations. Our payment provider, Monime, and the mobile network operators handle the payment
            itself under their own privacy policies.
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
          <strong>Payment records:</strong> details of payments, refunds and withdrawals, explained in full in the
          section &quot;Payments and your information&quot; below. Card details, mobile money PINs and passwords are never
          seen or stored by us.
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
          important account and system actions, kept for security, abuse prevention, dispute resolution, and
          troubleshooting. Passwords, form answers, and who a voter voted for are never written to these records.
        </li>
      </ul>
    ),
  },
  {
    id: "payments",
    title: "Payments and your information",
    body: (
      <>
        <p>When you pay through the Service, or an organization takes payments through it, we handle the following:</p>
        <ul>
          <li>
            <strong>Payer details:</strong> the name, email address and phone number given when paying (for paid votes, the
            voter account used) and the mobile money provider used.
          </li>
          <li>
            <strong>Payment details:</strong> the amount and currency, what was bought (for example a registration, ID
            card, ticket, ordered items or votes), reference and payment numbers, the provider&apos;s transaction
            identifiers, the status, any failure reason, and the times involved.
          </li>
          <li>
            <strong>Refunds:</strong> the amount, the reason given, who requested and approved it, and the number it was
            sent to.
          </li>
          <li>
            <strong>Withdrawals:</strong> the withdrawal accounts an organization adds (the account name and the mobile
            money number or bank account, shown in masked form), who requested and approved each withdrawal, and its
            status.
          </li>
          <li>
            <strong>Fees and balances:</strong> the Platform Fee taken from each payment and the running record of each
            organization&apos;s payment fund.
          </li>
        </ul>
        <p>
          <strong>What we never see.</strong> Payments are made on Monime&apos;s own secure page. We never see or store
          card numbers, mobile money PINs or passwords.
        </p>
        <p>
          <strong>Why we use it.</strong> To process and confirm payments with the provider, credit the right
          organization, send confirmations and receipts, handle refunds and withdrawals, apply and report fees, detect and
          prevent fraud, money laundering and abuse, resolve disputes, give support, and keep the financial and accounting
          records the law requires.
        </p>
        <p>
          <strong>Who sees it.</strong> The organization you paid sees your name, contact details, what you paid for, the
          amount and the status of your payment. For paid votes, the organizer sees that you paid and how many votes you
          bought, but never which candidate you chose. Monime and the mobile network operators process your payment under
          their own privacy policies, and banks or operators may also receive the details needed to complete a withdrawal.
          We may share information with the authorities where the law requires it or to prevent fraud.
        </p>
        <p>
          <strong>How long we keep it.</strong> Payment, refund, withdrawal and fee records are financial records. We keep
          them for as long as needed for accounting, tax, security and dispute purposes and as the law requires, which can
          be longer than the life of an account. When we no longer need them, we delete or anonymize them.
        </p>
        <p>
          <strong>How we protect it.</strong> A payment is only counted after we confirm it directly with the provider.
          Payment links are private and signed. Withdrawals need the administrator&apos;s password, new withdrawal accounts
          wait before first use, and large withdrawals and refunds are reviewed.
        </p>
        <p>
          <strong>Your choices.</strong> For questions about a payment, contact the organization you paid first. You can
          also contact us at <Email /> with your payment number. We may not be able to delete payment records we are
          required to keep, but we will explain what we can do.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use information",
    body: (
      <ul>
        <li>To provide the Service: accounts, forms, registrations, ID cards, tickets, analytics, and exports.</li>
        <li>To send service emails such as verification codes, invitations, password resets, and registration and payment confirmations.</li>
        <li>To process and confirm payments, credit payment funds, and handle refunds and withdrawals.</li>
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
          <li>With our authorized staff, only where needed to operate, support, and secure the Service, and under duties of confidentiality.</li>
          <li>With our payment provider (Monime) and the mobile network operators, to process payments, refunds and withdrawals.</li>
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
        legal, security, or dispute-resolution reasons. Payment, refund, withdrawal and fee records are kept as described
        in &quot;Payments and your information&quot;.
      </p>
    ),
  },
  {
    id: "security",
    title: "How we protect information",
    body: (
      <p>
        We use encryption in transit (HTTPS), hashed passwords, short-lived sign-in sessions, email verification, role-based
        access, and separated workspaces for each organization. Payments are confirmed directly with our payment
        provider, and withdrawals need extra confirmation and checks. No system is completely secure, so please use a strong
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
        using a social media button, that site may set its own cookies under its own policy once you visit it. When you
        pay, you are sent to our payment provider&apos;s own page (Monime), which may use its own cookies under its own policy.
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
        <li>Collecting payments for goods or services that are illegal, that you do not intend to provide, or that you cannot deliver.</li>
        <li>Money laundering, financing crime, or splitting or disguising payments to avoid limits and checks.</li>
        <li>Withdrawing or refunding money to accounts you do not control, or keeping payments you know were made by mistake or by fraud.</li>
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
        <li>Show clear prices, deliver what you charge for, and handle refund requests and complaints fairly and promptly.</li>
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
        We may investigate suspected violations and may remove content, unpublish programs, hold or reverse payments and
        withdrawals, or suspend or close accounts.
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
