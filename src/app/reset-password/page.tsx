import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell, AuthMessage, PasswordFields } from "@/components/auth-page";
import { Button } from "@/components/ui/button";
import { requireIdentity } from "@/lib/auth/identity";
import { recoveryCookie, verifyRecovery } from "@/lib/auth/recovery";

export default async function Page({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { client, user } = await requireIdentity();
  const claims = await client.auth.getClaims();
  const sid = claims.data?.claims.session_id;
  if (claims.error || typeof sid !== "string" || !verifyRecovery((await cookies()).get(recoveryCookie)?.value, user.id, sid)) {
    redirect("/forgot-password?message=invalid_link");
  }
  return <AuthShell title="Choose a new password">
    <AuthMessage code={(await searchParams).message} />
    <form method="post" action="/auth/reset-password" className="space-y-4">
      <PasswordFields confirm /><Button type="submit">Update password</Button>
    </form>
  </AuthShell>;
}
