import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { resolveIdentity } from "@/lib/auth/identity";
import { authMessages, safeDestination } from "@/lib/auth/policy";

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return <main id="main-content" className="mx-auto max-w-md space-y-6 px-6 py-16">
    <Link href="/" prefetch={false} className="text-sm underline">Student Opportunities Platform</Link>
    <h1 className="text-3xl font-semibold">{title}</h1>
    {children}
  </main>;
}

export function AuthMessage({ code }: { code: unknown }) {
  const message = typeof code === "string" ? authMessages[code] : undefined;
  return message ? <p role="status" className="border-l-2 border-primary pl-3 text-sm">{message}</p> : null;
}

export function PasswordFields({ confirm = false, existing = false }: { confirm?: boolean; existing?: boolean }) {
  return <>
    <label className="block space-y-2">Password
      <input name="password" type="password" required minLength={existing ? 1 : 12} maxLength={128}
        autoComplete={existing ? "current-password" : "new-password"}
        className="block w-full rounded border p-2 focus-visible:outline-2 focus-visible:outline-ring" />
    </label>
    {!existing && <p className="text-sm text-muted-foreground">Use 12–128 characters.</p>}
    {confirm && <label className="block space-y-2">Confirm password
      <input name="confirm_password" type="password" required minLength={12} maxLength={128} autoComplete="new-password"
        className="block w-full rounded border p-2 focus-visible:outline-2 focus-visible:outline-ring" />
    </label>}
  </>;
}

export async function AuthPage({ kind, params }: {
  kind: "login" | "signup" | "forgot-password";
  params: Record<string, string | string[] | undefined>;
}) {
  const { user } = await resolveIdentity();
  if (user && kind !== "forgot-password") redirect(safeDestination(params.next));
  const title = { login: "Sign in", signup: "Create an account", "forgot-password": "Recover your password" }[kind];
  return <AuthShell title={title}>
    <AuthMessage code={params.message} />
    <form method="post" action={"/auth/" + kind} className="space-y-4">
      <input type="hidden" name="next" value={safeDestination(params.next)} />
      <label className="block space-y-2">Email
        <input name="email" type="email" required maxLength={254} autoComplete="email"
          className="block w-full rounded border p-2 focus-visible:outline-2 focus-visible:outline-ring" />
      </label>
      {kind !== "forgot-password" && <PasswordFields confirm={kind === "signup"} existing={kind === "login"} />}
      <Button type="submit">{kind === "forgot-password" ? "Send recovery link" : title}</Button>
    </form>
    <nav aria-label="Account access" className="flex flex-wrap gap-4 text-sm underline">
      <a href="/login">Sign in</a><a href="/signup">Create account</a><a href="/forgot-password">Forgot password?</a>
    </nav>
  </AuthShell>;
}
