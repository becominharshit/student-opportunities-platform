import type { EventRow } from "@/lib/events/validation";
import { textFields, numberFields, jsonFields, choices } from "@/lib/events/validation";
type Lookup = {
    id: string;
    name: string;
};
export function EventEditor({ event, organizers, categories, tags = [], deadlines = [] }: {
    event?: EventRow;
    organizers: Lookup[];
    categories: Lookup[];
    tags?: unknown[];
    deadlines?: unknown[];
}) {
    const inputClass = "block w-full border p-2 mt-1 mb-4 rounded";
    const value = (key: string) => event?.[key as keyof EventRow];
    const label = (key: string) => key.replaceAll("_", " ");
    return <form action="/admin/events/mutate" method="post" className="max-w-3xl">
  <input type="hidden" name="action" value={event ? "update" : "create"}/>
  {event && <><input type="hidden" name="id" value={event.id}/><input type="hidden" name="expected_version" value={event.version}/></>}
  <p className="my-4">Blank optional fields remain unknown. Only enter facts supported by evidence. Slugs are permanent. Plain text is rendered safely; HTML is not interpreted.</p>
  {textFields.filter(k => !event || k !== "slug").map(k => <label key={k} className="block capitalize">{label(k)}
   {k === "organizer_id" || k === "category_id" ? <select name={k} defaultValue={String(value(k) ?? "")} className={inputClass}><option value="">Unknown</option>{(k === "organizer_id" ? organizers : categories).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select> :
                ["short_description", "full_description", "participation_process", "eligibility_text"].includes(k) ? <textarea name={k} defaultValue={String(value(k) ?? "")} className={inputClass}/> :
                    <input name={k} required={k === "title" || k === "slug"} defaultValue={String(value(k) ?? "")} className={inputClass} placeholder={k.endsWith("_at") ? "YYYY-MM-DDTHH:mm:ss+05:30" : k.endsWith("_date") ? "YYYY-MM-DD" : undefined}/>}
  </label>)}
  <p>Date-only facts must not have timestamps. Exact timestamps require the evidenced timezone and matching local date.</p>
  {Object.entries(choices).map(([k, options]) => <label className="block capitalize" key={k}>{label(k)}<select className={inputClass} name={k} defaultValue={String(value(k) ?? (options.includes("unknown") ? "unknown" : options.includes("pending") ? "pending" : ""))}>{["mode", "verification_level"].includes(k) && <option value="">Unknown</option>}{options.map(o => <option key={o} value={o}>{label(o)}</option>)}</select></label>)}
  {numberFields.map(k => <label key={k} className="block capitalize">{label(k)}<input className={inputClass} name={k} type="number" step="any" defaultValue={value(k) == null ? "" : String(value(k))}/></label>)}
  <label>Individual allowed<select className={inputClass} name="individual_allowed" defaultValue={value("individual_allowed") == null ? "" : String(value("individual_allowed"))}><option value="">Unknown</option><option value="true">Yes</option><option value="false">No</option></select></label>
  <details><summary>Structured rules, tags and deadlines</summary>
   <p>Eligibility uses the existing version 1 rule structure; this editor does not evaluate eligibility. Unknown rules stay null or explicitly unresolved.</p>
   {jsonFields.map(k => <label key={k} className="block capitalize">{label(k)} (JSON; blank means unknown)<textarea className={inputClass + " font-mono"} name={k} rows={5} defaultValue={value(k) == null ? "" : JSON.stringify(value(k), null, 2)}/></label>)}
   <p>Tags use existing vocabulary slugs. Each entry contains kind (domain or skill), tag, and skill_id for skills. An empty collection explicitly removes associations; it does not mean unrestricted eligibility.</p>
   <label>Tags (JSON array)<textarea className={inputClass + " font-mono"} name="tags" rows={5} defaultValue={JSON.stringify(tags, null, 2)}/></label>
   <p>Deadlines contain kind (registration, submission, stage), label, precision, local_date, due_at, timezone, source_id, active and is_primary. Keep existing IDs when editing; omit ID for a new deadline. For date_only leave due_at null. Only one active primary registration deadline is allowed. Removing an entry explicitly removes that deadline.</p>
   <label>Deadlines (JSON array)<textarea className={inputClass + " font-mono"} name="deadlines" rows={8} defaultValue={JSON.stringify(deadlines, null, 2)}/></label>
  </details>
  <label>Reason for this change<input className={inputClass} name="reason" required maxLength={1000}/></label>
  <button className="border px-4 py-2" type="submit">{event ? "Save changes" : "Create draft"}</button>
 </form>;
}
