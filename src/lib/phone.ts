const PHONE_REGEX = /^\(\d{2}\)\d{5}-\d{4}$/;

export function formatPhone(input: string | null | undefined): string {
  if (!input) return "";
  const digits = input.replace(/\D/g, "").slice(0, 11);
  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
  return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function isValidPhone(input: string | null | undefined): boolean {
  if (!input) return false;
  return PHONE_REGEX.test(input);
}

export const PHONE_PLACEHOLDER = "(XX)XXXXX-XXXX";
