import { requireAdministrator } from "@/lib/auth/identity";
import { readAdminEvent, messages } from "@/lib/events/service";
import { EventEditor } from "@/components/event-editor";
export default async function Page({ params, searchParams }: {
    params: Promise<{
        id: string;
    }>;
    searchParams: Promise<{
        saved?: string;
    }>;
}) {
    const { client } = await requireAdministrator();
    const { id } = await params;
    const result = await readAdminEvent(client, id);
    if (!result.ok)
        return <main className="p-8"><p role="alert">{messages[result.code]}</p><a href="/admin">All events</a></main>;
    const e = result.value;
    const [o, c, interests, skills] = await Promise.all([client.from("organizers").select("id,name").order("name").limit(500), client.from("event_categories").select("id,name"), client.from("interests").select("slug,name").limit(500), client.from("skills").select("id,slug,name").limit(500)]);
    const deadlines = e.event_deadlines.map(({ id, kind, label, local_date, due_at, timezone, precision, source_id, active, is_primary }) => ({ id, kind, label, local_date, due_at, timezone, precision, source_id, active, is_primary }));
    const actions = e.publication_status === "archived" ? [] : e.publication_status === "published" ? ["unpublish", "archive"] : e.publication_status === "review" ? ["publish", "archive"] : ["review", "archive"];
    return <main className="max-w-4xl mx-auto p-8"><a href="/admin" className="underline">All events</a><h1 className="text-3xl">{e.title}</h1><p>State: {e.publication_status}; version {e.version}</p>{(await searchParams).saved && <p role="status">Changes saved.</p>}
 <section className="my-6"><h2 className="text-xl">Publication review</h2><p>Publishing requires current verification, complete identity and checked matching source evidence. No source evidence is created by this editor.</p>{actions.map(action => <form key={action} action="/admin/events/mutate" method="post" className="my-3"><input type="hidden" name="action" value={action}/><input type="hidden" name="id" value={e.id}/><input type="hidden" name="expected_version" value={e.version}/><label>Reason to {action}<input className="border p-2 mx-2" name="reason" required maxLength={1000}/></label><button className="border p-2 capitalize">{action}</button></form>)}</section>
 <details><summary>Existing supporting evidence</summary><pre className="whitespace-pre-wrap break-all">{JSON.stringify(e.event_sources, null, 2)}</pre></details>
 <details><summary>Available tag vocabulary</summary><pre className="whitespace-pre-wrap">{JSON.stringify({ domains: interests.data, skills: skills.data }, null, 2)}</pre></details>
 {e.publication_status !== "archived" && (o.error || c.error ? <p role="alert">Reference data unavailable.</p> : <EventEditor event={e} organizers={o.data} categories={c.data} tags={e.event_tags.map(({ kind, tag, skill_id }) => ({ kind, tag, skill_id }))} deadlines={deadlines}/>)}
 <h2 className="text-xl mt-8">History</h2>{e.event_changes.sort((a, b) => b.event_version - a.event_version).map(h => <details key={h.id}><summary>Version {h.event_version} — {h.reason} — {h.created_at}</summary><p>Actor: {h.actor_id ?? "Deleted account"}</p><pre className="whitespace-pre-wrap break-all">{JSON.stringify({ changes: h.field_diff, evidence: h.evidence_snapshot }, null, 2)}</pre></details>)}
 </main>;
}
