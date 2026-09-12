/** Public configuration only. Never import privileged environment modules here. */
export function getPublicSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public configuration is missing.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) {
    throw new Error("Supabase URL must use HTTPS, except for loopback development.");
  }
  if (parsed.username || parsed.password) throw new Error("Supabase URL must not contain credentials.");
  // A legacy anon JWT is permitted, but a privileged JWT is never a public key.
  let legacyAnon = false;
  if (key.split(".").length === 3) {
    try {
      const payload = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      legacyAnon = payload.role === "anon";
    } catch { /* Reject malformed keys without echoing them. */ }
  }
  if (!key.startsWith("sb_publishable_") && !legacyAnon) {
    throw new Error("Use a Supabase publishable key or legacy anon key for public configuration.");
  }
  return { url, key };
}

