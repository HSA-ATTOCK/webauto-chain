const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function extractDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = extractDigits(trimmed);
  if (!digits) {
    return "";
  }
  const hasPlusPrefix = trimmed.startsWith("+");
  return hasPlusPrefix ? `+${digits}` : digits;
}

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function isValidPhone(value: string): boolean {
  const normalized = normalizePhone(value);
  if (!normalized) {
    return false;
  }

  const digitsOnly = normalized.startsWith("+")
    ? normalized.slice(1)
    : normalized;

  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

export function parseContact(
  raw: string
): { type: "email"; value: string } | { type: "phone"; value: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (isEmail(trimmed)) {
    return { type: "email", value: trimmed.toLowerCase() };
  }

  if (isValidPhone(trimmed)) {
    const normalized = normalizePhone(trimmed);
    if (!normalized) {
      return null;
    }

    return { type: "phone", value: normalized };
  }

  return null;
}
