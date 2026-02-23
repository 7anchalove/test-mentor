export function normalizeMeetingUrl(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "";

  const lower = raw.toLowerCase();
  const hasHttpProtocol = lower.startsWith("http://") || lower.startsWith("https://");

  if (hasHttpProtocol) return raw;

  if (lower.startsWith("meet.google.com") || lower.startsWith("www.meet.google.com")) {
    return `https://${raw}`;
  }

  if (lower.includes("meet.google.com/")) {
    return `https://${raw}`;
  }

  return raw;
}

export function isValidAbsoluteHttpUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
