import { ClipboardList, Gift, IdCard, ReceiptText, ShoppingBag, Users, Vote, Wallet } from "lucide-react";

const FEATURES = [
  { icon: ClipboardList, title: "Programs & registrations", text: "Custom forms and approvals" },
  { icon: IdCard, title: "ID cards & tickets", text: "Designed, issued and verified" },
  { icon: Vote, title: "Voting polls", text: "Fair, secure online elections" },
  { icon: ShoppingBag, title: "Order forms", text: "Sell items and take orders" },
  { icon: Wallet, title: "Mobile money payments", text: "Get paid, refund, withdraw" },
  { icon: ReceiptText, title: "Bookkeeping", text: "Invoices, receipts and reports" },
  { icon: Gift, title: "Wish lists", text: "Share and receive gifts" },
  { icon: Users, title: "Team access", text: "Invite people with roles" },
];

/** What the platform does, shown on the colored side of the sign-in and sign-up pages. */
export function AuthFeatures({ heading }: { heading: string }) {
  return (
    <div className="relative flex w-full flex-col items-center gap-6">
      <h1 className="text-center text-3xl font-bold leading-tight">{heading}</h1>
      <ul className="grid w-full max-w-md grid-cols-2 gap-2.5">
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex items-start gap-2.5 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-md">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-tight">{title}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-white/70">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
