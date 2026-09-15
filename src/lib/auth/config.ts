import "server-only";

export function appOrigin() {
  const raw = process.env.APP_URL;
  if (!raw) throw new Error("APP_URL must be configured for authentication.");
  const url = new URL(raw);
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
    throw new Error("APP_URL must be an HTTPS origin or local loopback origin.");
  }
  return url.origin;
}

export function authCookieOptions() {
  return { path: "/", sameSite: "lax" as const, secure: appOrigin().startsWith("https:") };
}
