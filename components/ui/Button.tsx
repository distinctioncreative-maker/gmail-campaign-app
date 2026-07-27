"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: Variant;
  /** Disables the button and swaps in a spinner (+ optional loadingText). */
  loading?: boolean;
  /**
   * True for a brief window right after an action resolves, to show a
   * success flash. Controlled by the caller (e.g. clear it on a timeout) —
   * this component just renders whatever state it's given.
   */
  success?: boolean;
  loadingText?: ReactNode;
  children: ReactNode;
}

/**
 * Shared button with real loading/success feedback instead of just a
 * disabled state. Every variant already has hover/press motion from
 * app/globals.css; this adds the spinner and the success-flash animation.
 */
export function Button({
  variant = "primary",
  loading = false,
  success = false,
  loadingText,
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`${VARIANT_CLASS[variant]} ${success ? "btn-success-flash" : ""} ${className}`}
    >
      {loading ? (
        <>
          <span className="btn-spinner" aria-hidden />
          {loadingText ?? children}
        </>
      ) : success ? (
        <>
          <Icon name="check" size={16} />
          Done
        </>
      ) : (
        children
      )}
    </button>
  );
}
