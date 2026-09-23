// Only implemented internal destinations are accepted, including after decoding.
export function safeDestination(value: unknown): string {
  return typeof value === "string" && ["/for-you", "/admin", "/account/profile", "/onboarding"].includes(value) ? value : "/account";
}

export function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validPassword(value: string): boolean {
  return value.length >= 12 && value.length <= 128;
}

export const authMessages: Record<string, string> = {
  credentials: "Could not sign in. Check your email and password, and verify your email if needed.",
  input: "Enter a valid email and a password of 12–128 characters. Password confirmation must match.",
  verification: "If signup can proceed, check your email for a verification link. Your email is not verified yet.",
  recovery: "If this address can receive a recovery email, a link will arrive shortly.",
  invalid_link: "This link is invalid, expired, or already used. Request a new link and try again.",
  reset: "Your password was updated. Please sign in with your new password.",
  unavailable: "Authentication is temporarily unavailable. Please try again shortly.",
  forbidden: "Your account does not have administrator access.",
  signed_out: "You are signed out on this device.",
  rate_limit: "Too many attempts. Please wait a few minutes before trying again.",
};
