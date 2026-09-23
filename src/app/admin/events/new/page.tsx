import Link from "next/link";
import { requireAdministrator } from "@/lib/auth/identity";
import { EventEditor } from "@/components/event-editor";

export const metadata = {
    title: "Create Event | Administrator Operations",
    robots: { index: false, follow: false },
};

export default async function NewEventPage() {
    const { client } = await requireAdministrator();
    const [organizersRes, categoriesRes, interestsRes, skillsRes] = await Promise.all([
        client.from("organizers").select("id, name").order("name").limit(500),
        client.from("event_categories").select("id, name").order("name"),
        client.from("interests").select("slug, name").order("name").limit(500),
        client.from("skills").select("id, slug, name").order("name").limit(500),
    ]);

    return (
        <main className="max-w-5xl mx-auto p-4 sm:p-6 md:p-8 space-y-6">
            <div>
                <Link
                    href="/admin"
                    className="inline-flex items-center text-xs font-semibold text-blue-600 hover:underline"
                >
                    ← All Events (Admin Operations)
                </Link>
            </div>

            <div className="pb-4 border-b border-gray-200">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">
                    Create Event Draft
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                    Enter verified facts supported by evidence. Newly created events start in draft state.
                </p>
            </div>

            {organizersRes.error || categoriesRes.error ? (
                <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                    Reference data could not be loaded. Please reload the page.
                </div>
            ) : (
                <EventEditor
                    organizers={organizersRes.data ?? []}
                    categories={categoriesRes.data ?? []}
                    interests={interestsRes.data ?? []}
                    skills={skillsRes.data ?? []}
                />
            )}
        </main>
    );
}
