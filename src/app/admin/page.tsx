import Link from "next/link";
import { requireAdministrator } from "@/lib/auth/identity";
import { listAdminEvents, messages } from "@/lib/events/service";
export default async function Page({ searchParams }: {
    searchParams: Promise<{
        page?: string;
    }>;
}) {
    const { client } = await requireAdministrator();
    const params = await searchParams;
    const page = Math.max(0, Math.min(100000, Number(params.page) || 0));
    const result = await listAdminEvents(client, page);
    return <main className="max-w-5xl mx-auto p-8"><h1 className="text-3xl">Administrator access</h1><p className="my-4">Event management</p><Link className="underline" href="/admin/events/new">Create event</Link>
 {!result.ok ? <p role="alert">{messages[result.code]}</p> : <><ul className="my-6 space-y-3">{result.value.map(e => <li key={e.id}><a className="underline" href={"/admin/events/" + e.id}>{e.title}</a> — {e.publication_status}, version {e.version}</li>)}</ul>{!result.value.length && <p>No events on this page.</p>}<nav aria-label="Event pages">{page > 0 && <a href={"/admin?page=" + (page - 1)} className="underline mr-4">Previous</a>}{result.value.length === 25 && <a className="underline" href={"/admin?page=" + (page + 1)}>Next</a>}</nav></>}
 <a href="/account" className="underline">Back to account</a></main>;
}
