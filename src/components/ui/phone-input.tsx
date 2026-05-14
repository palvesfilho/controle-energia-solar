"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  PHONE_PLACEHOLDER,
  formatPhone,
  isValidPhone,
} from "@/lib/phone";

type NativeInputProps = Omit<
  React.ComponentProps<"input">,
  "onChange" | "value" | "defaultValue" | "type"
>;

export interface PhoneInputProps extends NativeInputProps {
  value?: string;
  defaultValue?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  errorClassName?: string;
  // Use plain <input> (unstyled fallback) instead of the shadcn Input primitive.
  // Useful for pages that bring their own custom-styled native inputs.
  unstyled?: boolean;
}

export function PhoneInput({
  value,
  defaultValue,
  onChange,
  onBlur,
  placeholder = PHONE_PLACEHOLDER,
  className,
  errorClassName,
  unstyled,
  ...rest
}: PhoneInputProps) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = React.useState(() =>
    formatPhone(defaultValue ?? "")
  );
  const [touched, setTouched] = React.useState(false);

  const displayed = isControlled ? formatPhone(value ?? "") : internal;
  const invalid = touched && displayed.length > 0 && !isValidPhone(displayed);

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const masked = formatPhone(e.target.value);
    e.target.value = masked;
    if (!isControlled) setInternal(masked);
    onChange?.(e);
  };

  const handleBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
    setTouched(true);
    onBlur?.(e);
  };

  const commonProps = {
    ...rest,
    type: "tel" as const,
    inputMode: "numeric" as const,
    placeholder,
    value: displayed,
    onChange: handleChange,
    onBlur: handleBlur,
    "aria-invalid": invalid || undefined,
  };

  return (
    <>
      {unstyled ? (
        <input
          {...commonProps}
          className={cn(
            "w-full mt-1 text-sm border rounded-md px-3 py-1.5 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all",
            invalid && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
            className
          )}
        />
      ) : (
        <Input {...commonProps} className={className} />
      )}
      {invalid && (
        <p className={cn("mt-1 text-xs text-red-500", errorClassName)}>
          Formato esperado: (XX)XXXXX-XXXX
        </p>
      )}
    </>
  );
}
