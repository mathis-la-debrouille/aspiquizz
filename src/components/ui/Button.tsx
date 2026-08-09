import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Required when children is empty (icon-only buttons) — see brief §4.4.7. */
  "aria-label"?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const base =
  "btn-physical inline-flex items-center justify-center gap-2 font-body font-medium " +
  "select-none whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 " +
  "disabled:active:translate-y-0 focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-gold";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-moss text-bg-void border border-moss-deep border-b-[3px] rounded-md " +
    "hover:not-disabled:brightness-110 active:not-disabled:brightness-95 " +
    "active:not-disabled:border-b-[1px] active:not-disabled:translate-y-[2px]",
  secondary:
    "bg-bg-surface text-ink-high border border-border-hard border-b-[3px] rounded-md " +
    "hover:not-disabled:bg-bg-raised active:not-disabled:border-b-[1px] " +
    "active:not-disabled:translate-y-[2px]",
  ghost:
    "bg-transparent text-ink-mid border border-transparent rounded-md " +
    "hover:not-disabled:bg-bg-surface hover:not-disabled:text-ink-high " +
    "active:not-disabled:translate-y-[1px]",
  danger:
    "bg-clay text-bg-void border border-clay-deep border-b-[3px] rounded-md " +
    "hover:not-disabled:brightness-110 active:not-disabled:brightness-95 " +
    "active:not-disabled:border-b-[1px] active:not-disabled:translate-y-[2px]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-12",
  md: "h-11 px-4 text-16",
  lg: "h-14 px-6 text-20",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    disabled,
    className,
    children,
    leadingIcon,
    trailingIcon,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        leadingIcon
      )}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});
