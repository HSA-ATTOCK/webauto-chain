const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PHONE_DIGITS_REGEX = /^\+?[0-9]{7,15}$/;

export type IdentifierResult =
  | { kind: "email"; value: string }
  | { kind: "phone"; value: string };

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const digitsOnly = trimmed.replace(/[\s\-()]/g, "");
  if (digitsOnly.startsWith("+")) {
    // In case a plus sign survives due to being the first char, strip any others
    const cleaned = `+${digitsOnly.slice(1).replace(/[^0-9]/g, "")}`;
    return cleaned;
  }

  const prefixPlus = trimmed.startsWith("+");
  const numbers = digitsOnly.replace(/[^0-9]/g, "");
  return prefixPlus ? `+${numbers}` : numbers;
}

export function parseIdentifier(value: string): IdentifierResult | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (EMAIL_REGEX.test(trimmed)) {
    return { kind: "email", value: normalizeEmail(trimmed) };
  }

  const normalizedPhone = normalizePhone(trimmed);
  if (PHONE_DIGITS_REGEX.test(normalizedPhone)) {
    return { kind: "phone", value: normalizedPhone };
  }

  return null;
}

export const emailRegex = EMAIL_REGEX;
export const phoneRegex = PHONE_DIGITS_REGEX;
