import * as React from "react";
import { Link, type LinkProps } from "react-router-dom";
import { type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export interface LinkButtonProps
  extends LinkProps,
    VariantProps<typeof buttonVariants> {
  className?: string;
}

export const LinkButton = React.forwardRef<HTMLAnchorElement, LinkButtonProps>(
  ({ className, variant = "outline", size, ...props }, ref) => (
    <Link ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);
LinkButton.displayName = "LinkButton";
