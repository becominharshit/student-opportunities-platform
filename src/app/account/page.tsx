import { requireIdentity } from "@/lib/auth/identity";
import { AuthMessage, AuthShell } from "@/components/auth-page";
import { Button } from "@/components/ui/button";

export default async function Page({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const { user } = await requireIdentity();
  return <AuthShell title="Your account">
    <AuthMessage code={(await searchParams).message} />
    <p>Signed in as {user.email}.</p>
    <p>Your email is verified. Student profile editing is not available yet.</p>
    <form method="post" action="/auth/logout"><Button type="submit">Sign out</Button></form>
    <a href="/forgot-password" className="block underline">Reset password by email</a>
    <a href="/admin" className="block underline">Administrator access</a>
  </AuthShell>;
}
