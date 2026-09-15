import { AuthPage } from "@/components/auth-page";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <AuthPage kind="forgot-password" params={await searchParams} />;
}
