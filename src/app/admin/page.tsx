import { requireAdministrator } from "@/lib/auth/identity";
import { AuthShell } from "@/components/auth-page";

export default async function Page() {
  await requireAdministrator();
  return <AuthShell title="Administrator access">
    <p>Your protected administrator membership has been confirmed.</p>
    <p>Event administration is not available yet.</p>
    <a href="/account" className="underline">Back to account</a>
  </AuthShell>;
}
