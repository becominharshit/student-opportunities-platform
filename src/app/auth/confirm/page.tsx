import { AuthShell } from "@/components/auth-page";
import { Button } from "@/components/ui/button";
import { safeDestination } from "@/lib/auth/policy";

export default async function Page({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; next?: string }> }) {
  const params = await searchParams;
  if (!/^[a-zA-Z0-9_-]{20,512}$/.test(params.token_hash ?? "") || !["signup", "recovery"].includes(params.type ?? "")) {
    return <AuthShell title="Invalid authentication link"><p>Request a new link and try again.</p><a href="/forgot-password">Recover password</a></AuthShell>;
  }
  return <AuthShell title={params.type === "recovery" ? "Confirm password recovery" : "Confirm your email"}>
    <p>Continue only if you requested this link for your own account. Opening this page has not verified your email or signed you in.</p>
    <form method="post" action="/auth/verify">
      <input type="hidden" name="token_hash" value={params.token_hash} />
      <input type="hidden" name="type" value={params.type} />
      <input type="hidden" name="next" value={safeDestination(params.next)} />
      <Button type="submit">Continue with this email link</Button>
    </form>
  </AuthShell>;
}
