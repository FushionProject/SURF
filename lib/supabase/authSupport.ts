export function readCredentials(
  formData: FormData,
  mode: "sign-in" | "create",
): { email?: string; password?: string; error?: string } {
  const emailValue = formData.get("email");
  const passwordValue = formData.get("password");
  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const password = typeof passwordValue === "string" ? passwordValue : "";

  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (!password) return { error: "Enter your password." };
  if (mode === "create" && password.length < 8) {
    return { error: "Use at least 8 characters for your password." };
  }
  if (password.length > 128) return { error: "That password is too long." };
  return { email, password };
}

export function friendlyAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "Email or password is incorrect.";
  if (normalized.includes("email not confirmed")) return "Confirm your email before signing in.";
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (normalized.includes("password")) return "That password does not meet the account requirements.";
  return "Surf could not complete that account request. Try again.";
}

function asOrigin(value?: string | null): URL | undefined {
  if (!value || /[\\\u0000-\u0020\u007f]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.pathname !== "/" || url.search || url.hash) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function isLocalPreview(url: URL): boolean {
  if (url.hostname === "localhost" || url.hostname === "[::1]") return true;
  const parts = url.hostname.split(".").map(Number);
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    (parts[0] === 127 || parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168));
}

/** Public sites keep their configured origin; explicitly local previews keep their actual port/device. */
export function resolveAuthOrigin(options: {
  configured?: string;
  requestOrigin?: string | null;
  requestHost?: string | null;
  development: boolean;
}): string | undefined {
  const configuredUrl = asOrigin(options.configured);
  const configured = configuredUrl && (configuredUrl.protocol === "https:" || isLocalPreview(configuredUrl))
    ? configuredUrl
    : undefined;
  const request = asOrigin(options.requestOrigin);
  const localPreview = configured ? isLocalPreview(configured) : options.development;
  if (localPreview && request &&
      isLocalPreview(request) && request.host === options.requestHost) return request.origin;
  return configured?.origin;
}

export function isEmailConfirmationType(value: string | null): value is
  "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email" {
  return value !== null && ["signup", "invite", "magiclink", "recovery", "email_change", "email"].includes(value);
}
