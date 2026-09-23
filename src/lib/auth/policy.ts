// Only implemented internal destinations are accepted, including after decoding.
export function safeDestination(value: unknown): string {
  if(typeof value==="string"&&value.length<=2048&&!/[\\\u0000-\u001f\u007f]/.test(value)&&value.startsWith("/")&&!value.startsWith("//")){
    try{const url=new URL(value,"https://internal.invalid");if(url.origin==="https://internal.invalid"&&!url.hash&&(url.pathname==="/explore"||url.pathname==="/saved"||(/^\/events\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname)&&!url.search)))return value;}catch{}
  }
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
