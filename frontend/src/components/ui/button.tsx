import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-brand text-white shadow-md shadow-blue-500/20 hover:shadow-glow hover:brightness-110",
        destructive:
          "bg-gradient-destructive text-white shadow-md shadow-rose-500/20 hover:shadow-lg hover:brightness-110",
        success:
          "bg-gradient-success text-white shadow-md shadow-emerald-500/20 hover:shadow-lg hover:brightness-110",
        outline:
          "border border-input bg-background/60 backdrop-blur-sm hover:border-transparent hover:bg-gradient-brand-soft hover:text-primary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "bg-gradient-brand-soft text-primary hover:brightness-95",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export { buttonVariants };

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Shows a spinner in place of the button's icons and disables it while work is in progress. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }), loading && "[&>svg:not(.button-spinner)]:hidden")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Loader2 className="button-spinner h-4 w-4 shrink-0 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
