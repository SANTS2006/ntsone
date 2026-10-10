import { Banknote, Coins, HandCoins, Landmark, Package, PiggyBank, Receipt, ShoppingBag, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import type { EntryKind, PayMethod } from "./api";

export interface KindInfo {
  kind: EntryKind;
  /** The big button, in the words a shopkeeper would use. */
  title: string;
  /** The short name used in tables. */
  label: string;
  hint: string;
  icon: LucideIcon;
  tone: string;
  moneyIn: boolean;
  /** Can part of it stay unpaid (credit)? */
  credit: boolean;
  /** Who it is with, in this kind's words. */
  partyLabel: string;
  categories: string[];
}

export const KINDS: Record<EntryKind, KindInfo> = {
  sale: {
    kind: "sale",
    title: "I sold something",
    label: "Sale",
    hint: "Money coming in from a customer",
    icon: ShoppingBag,
    tone: "from-emerald-500 to-teal-400",
    moneyIn: true,
    credit: true,
    partyLabel: "Who bought it?",
    categories: ["Goods", "Services", "Food and drink", "Clothes", "Phone credit", "Other sales"],
  },
  expense: {
    kind: "expense",
    title: "I spent money",
    label: "Expense",
    hint: "Rent, transport, wages, bills",
    icon: Receipt,
    tone: "from-rose-500 to-orange-400",
    moneyIn: false,
    credit: true,
    partyLabel: "Who did you pay?",
    categories: ["Rent", "Transport", "Wages", "Electricity", "Water", "Phone and data", "Repairs", "Taxes and fees", "Other"],
  },
  purchase: {
    kind: "purchase",
    title: "I bought stock",
    label: "Stock bought",
    hint: "Goods you will sell later",
    icon: Package,
    tone: "from-amber-500 to-yellow-400",
    moneyIn: false,
    credit: true,
    partyLabel: "Who did you buy from?",
    categories: ["Goods for sale", "Ingredients", "Materials", "Packaging", "Other stock"],
  },
  other_income: {
    kind: "other_income",
    title: "I received money",
    label: "Other income",
    hint: "Money that is not a sale",
    icon: HandCoins,
    tone: "from-sky-500 to-cyan-400",
    moneyIn: true,
    credit: false,
    partyLabel: "Who gave it?",
    categories: ["Grant", "Gift", "Commission", "Interest", "Other"],
  },
  owner_in: {
    kind: "owner_in",
    title: "I put my own money in",
    label: "Owner put in",
    hint: "Your own savings into the business",
    icon: PiggyBank,
    tone: "from-violet-500 to-fuchsia-400",
    moneyIn: true,
    credit: false,
    partyLabel: "Who put it in?",
    categories: ["Savings", "Family help", "Other"],
  },
  owner_out: {
    kind: "owner_out",
    title: "I took money for myself",
    label: "Owner took out",
    hint: "Money you took out of the business",
    icon: Wallet,
    tone: "from-slate-500 to-slate-400",
    moneyIn: false,
    credit: false,
    partyLabel: "Who took it?",
    categories: ["Personal use", "Family", "School fees", "Other"],
  },
  loan_out: { kind: "loan_out", title: "I lent money", label: "Loan given", hint: "Money someone must pay back to you", icon: Coins, tone: "from-blue-500 to-indigo-400", moneyIn: false, credit: false, partyLabel: "Who got the loan?", categories: ["Loan"] },
  loan_in: { kind: "loan_in", title: "I borrowed money", label: "Loan received", hint: "Money you must pay back", icon: Landmark, tone: "from-purple-500 to-pink-400", moneyIn: true, credit: false, partyLabel: "Who lent it to you?", categories: ["Loan"] },
  loan_repayment_in: { kind: "loan_repayment_in", title: "Loan paid back to me", label: "Loan paid to you", hint: "", icon: Banknote, tone: "from-emerald-500 to-teal-400", moneyIn: true, credit: false, partyLabel: "Who paid?", categories: ["Loan"] },
  loan_repayment_out: { kind: "loan_repayment_out", title: "I paid back a loan", label: "Loan you paid", hint: "", icon: Banknote, tone: "from-rose-500 to-orange-400", moneyIn: false, credit: false, partyLabel: "Who did you pay?", categories: ["Loan"] },
};

/** The six things people write down most, as big buttons. */
export const QUICK_KINDS: EntryKind[] = ["sale", "expense", "purchase", "other_income", "owner_in", "owner_out"];

export const METHODS: { value: PayMethod; label: string; icon: LucideIcon }[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "mobile_money", label: "Mobile money", icon: Smartphone },
  { value: "bank", label: "Bank", icon: Landmark },
  { value: "other", label: "Other", icon: Coins },
];

export const methodLabel = (method: string) => METHODS.find((m) => m.value === method)?.label ?? method;

export const today = () => new Date().toISOString().slice(0, 10);

export const dayLabel = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
