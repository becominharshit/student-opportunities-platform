import { requireAdministrator } from "@/lib/auth/identity";
import { EventEditor } from "@/components/event-editor";
export default async function Page() {
    const { client } = await requireAdministrator();
    const [o, c] = await Promise.all([client.from("organizers").select("id,name").order("name").limit(500), client.from("event_categories").select("id,name").order("name")]);
    return <main className="max-w-4xl mx-auto p-8"><a href="/admin" className="underline">All events</a><h1 className="text-3xl">Create event</h1>{o.error || c.error ? <p role="alert">Reference data could not be loaded.</p> : <EventEditor organizers={o.data} categories={c.data}/>}</main>;
}
