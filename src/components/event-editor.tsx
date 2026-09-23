"use client";
import { useState } from "react";
import type { EventRow } from "@/lib/events/validation";
import { choices } from "@/lib/events/validation";

export type Lookup = {
    id: string;
    name: string;
    slug?: string;
};

export type InterestLookup = {
    slug: string;
    name: string;
};

export type SkillLookup = {
    id: string;
    slug: string;
    name: string;
};

export type TagItem = {
    kind: string;
    tag: string;
    skill_id?: string | null;
};

export type DeadlineItem = {
    id?: string;
    kind: string;
    label: string;
    local_date: string | null;
    due_at: string | null;
    timezone: string | null;
    precision: string;
    source_id?: string | null;
    active: boolean;
    is_primary: boolean;
};

export function EventEditor({
    event,
    organizers,
    categories,
    interests = [],
    skills = [],
    tags = [],
    deadlines = [],
}: {
    event?: EventRow;
    organizers: Lookup[];
    categories: Lookup[];
    interests?: InterestLookup[];
    skills?: SkillLookup[];
    tags?: TagItem[];
    deadlines?: DeadlineItem[];
}) {
    // 1. Controlled Tags State
    const [selectedTags, setSelectedTags] = useState<TagItem[]>(() => {
        return tags.map(t => ({
            kind: t.kind,
            tag: t.tag,
            skill_id: t.kind === "skill" ? (t.skill_id ?? null) : null,
        }));
    });

    // Detect legacy tags outside vocabulary
    const legacyTags = selectedTags.filter(t => {
        if (t.kind === "domain") return !interests.some(i => i.slug === t.tag);
        if (t.kind === "skill") return !skills.some(s => s.slug === t.tag);
        return true;
    });

    function toggleDomain(slug: string) {
        setSelectedTags(prev => {
            const exists = prev.some(t => t.kind === "domain" && t.tag === slug);
            if (exists) {
                return prev.filter(t => !(t.kind === "domain" && t.tag === slug));
            } else {
                return [...prev, { kind: "domain", tag: slug, skill_id: null }];
            }
        });
    }

    function toggleSkill(skill: SkillLookup) {
        setSelectedTags(prev => {
            const exists = prev.some(t => t.kind === "skill" && t.tag === skill.slug);
            if (exists) {
                return prev.filter(t => !(t.kind === "skill" && t.tag === skill.slug));
            } else {
                return [...prev, { kind: "skill", tag: skill.slug, skill_id: skill.id }];
            }
        });
    }

    // 2. Deadlines State
    const [deadlineList, setDeadlineList] = useState<DeadlineItem[]>(() => {
        return deadlines.map(d => ({
            id: d.id,
            kind: d.kind || "registration",
            label: d.label || "",
            local_date: d.local_date || null,
            due_at: d.due_at || null,
            timezone: d.timezone || null,
            precision: d.precision || "date_only",
            source_id: d.source_id || null,
            active: d.active !== false,
            is_primary: Boolean(d.is_primary),
        }));
    });
    const [showRawDeadlines, setShowRawDeadlines] = useState(false);

    function addDeadline() {
        setDeadlineList(prev => [
            ...prev,
            {
                kind: "registration",
                label: "Registration deadline",
                precision: "date_only",
                local_date: null,
                due_at: null,
                timezone: null,
                active: true,
                is_primary: prev.length === 0,
            },
        ]);
    }

    function updateDeadline(index: number, patch: Partial<DeadlineItem>) {
        setDeadlineList(prev => {
            const next = [...prev];
            const current = { ...next[index], ...patch };
            // If setting this deadline as primary, unmark others if they are primary
            if (patch.is_primary) {
                for (let i = 0; i < next.length; i++) {
                    if (i !== index) next[i] = { ...next[i], is_primary: false };
                }
            }
            next[index] = current;
            return next;
        });
    }

    function removeDeadline(index: number) {
        setDeadlineList(prev => prev.filter((_, i) => i !== index));
    }

    // 3. Eligible Years (Independent column: number[] | null)
    const initialYears: number[] | null = Array.isArray(event?.eligible_years) ? (event?.eligible_years as number[]) : null;
    const [eligibleYears, setEligibleYears] = useState<number[] | null>(initialYears);

    function toggleYear(year: number) {
        setEligibleYears(prev => {
            const current = prev ? [...prev] : [];
            const idx = current.indexOf(year);
            if (idx >= 0) {
                current.splice(idx, 1);
                return current.length > 0 ? current.sort((a, b) => a - b) : null;
            } else {
                current.push(year);
                return current.sort((a, b) => a - b);
            }
        });
    }

    // 4. Eligible Degrees (Independent column: string[] | null)
    const initialDegrees: string[] | null = Array.isArray(event?.eligible_degrees) ? (event?.eligible_degrees as string[]) : null;
    const [degreesInput, setDegreesInput] = useState<string>(initialDegrees ? initialDegrees.join(", ") : "");

    // 5. Eligibility Rules (Independent column: AST Json | null)
    const [eligibilityRulesJson, setEligibilityRulesJson] = useState<string>(() => {
        return event?.eligibility_rules ? JSON.stringify(event.eligibility_rules, null, 2) : "";
    });
    const [presetEvidence, setPresetEvidence] = useState<string>("");
    const [presetReason, setPresetReason] = useState<string>("");
    const presetYears = [1, 2, 3, 4];

    function applyPreset(presetType: "all_students" | "specific_years" | "unrestricted" | "unresolved") {
        if (presetType === "all_students") {
            if (!presetEvidence.trim()) {
                alert("Please enter the official rule/evidence text first before applying this preset.");
                return;
            }
            const ast = {
                version: 1,
                expression: {
                    op: "predicate",
                    field: "student_status",
                    operator: "eq",
                    value: true,
                    evidence: presetEvidence.trim(),
                },
            };
            setEligibilityRulesJson(JSON.stringify(ast, null, 2));
        } else if (presetType === "specific_years") {
            if (!presetEvidence.trim()) {
                alert("Please enter the official rule/evidence text first before applying this preset.");
                return;
            }
            const ast = {
                version: 1,
                expression: {
                    op: "predicate",
                    field: "study_year",
                    operator: "in",
                    value: presetYears,
                    evidence: presetEvidence.trim(),
                },
            };
            setEligibilityRulesJson(JSON.stringify(ast, null, 2));
        } else if (presetType === "unrestricted") {
            if (!presetEvidence.trim()) {
                alert("Please enter the official rule/evidence text first before applying this preset.");
                return;
            }
            const ast = {
                version: 1,
                expression: {
                    op: "predicate",
                    field: "student_status",
                    operator: "unrestricted",
                    evidence: presetEvidence.trim(),
                },
            };
            setEligibilityRulesJson(JSON.stringify(ast, null, 2));
        } else if (presetType === "unresolved") {
            if (!presetReason.trim()) {
                alert("Please provide the reason why eligibility is unresolved (e.g. Evidence incomplete).");
                return;
            }
            const ast = {
                version: 1,
                expression: {
                    op: "unresolved",
                    reason: presetReason.trim(),
                },
            };
            setEligibilityRulesJson(JSON.stringify(ast, null, 2));
        }
    }

    // Helper to format values for inputs
    const value = (key: string) => event?.[key as keyof EventRow];
    const inputClass = "block w-full border border-gray-300 rounded-md p-2 mt-1 mb-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600";
    const labelClass = "block text-sm font-semibold text-gray-800 mb-1";

    // Cleaned payload serializations
    const cleanedDeadlines = deadlineList.map(d => {
        const item: Record<string, unknown> = {
            kind: d.kind,
            label: d.label,
            precision: d.precision,
            active: Boolean(d.active),
            is_primary: Boolean(d.is_primary),
        };
        if (d.id) item.id = d.id;
        if (d.source_id) item.source_id = d.source_id;
        if (d.timezone) item.timezone = d.timezone;
        if (d.precision === "unknown") {
            item.local_date = null;
            item.due_at = null;
        } else if (d.precision === "date_only") {
            item.local_date = d.local_date || null;
            item.due_at = null;
        } else if (d.precision === "datetime") {
            item.local_date = d.local_date || null;
            item.due_at = d.due_at || null;
        }
        return item;
    });

    const parsedDegrees = degreesInput
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0);

    return (
        <form action="/admin/events/mutate" method="post" className="max-w-4xl space-y-8">
            <input type="hidden" name="action" value={event ? "update" : "create"} />
            {event && (
                <>
                    <input type="hidden" name="id" value={event.id} />
                    <input type="hidden" name="expected_version" value={event.version} />
                </>
            )}

            {/* Hidden Serialized Fields */}
            <input type="hidden" name="tags" value={JSON.stringify(selectedTags)} />
            <input type="hidden" name="deadlines" value={JSON.stringify(cleanedDeadlines)} />
            <input
                type="hidden"
                name="eligible_years"
                value={eligibleYears && eligibleYears.length > 0 ? JSON.stringify(eligibleYears) : ""}
            />
            <input
                type="hidden"
                name="eligible_degrees"
                value={parsedDegrees.length > 0 ? JSON.stringify(parsedDegrees) : ""}
            />
            <input
                type="hidden"
                name="eligibility_rules"
                value={eligibilityRulesJson.trim() ? eligibilityRulesJson.trim() : ""}
            />

            {/* Info Notice */}
            <div className="bg-blue-50 border-l-4 border-blue-600 p-4 rounded text-sm text-blue-900">
                <p className="font-semibold mb-1">Administrator Guidelines</p>
                <p>
                    Blank optional fields remain unknown (null). Only record facts supported by verified evidence.
                    Slugs are permanent and immutable once created.
                </p>
            </div>

            {/* Fieldset 1: Core Information */}
            <fieldset className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                <legend className="font-bold text-gray-900 px-2 text-base">1. Core Information</legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div className="md:col-span-2">
                        <label className={labelClass} htmlFor="title">
                            Title <span className="text-red-600">*</span>
                        </label>
                        <input
                            id="title"
                            name="title"
                            required
                            defaultValue={String(value("title") ?? "")}
                            className={inputClass}
                            placeholder="e.g. National Hackathon 2026"
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="slug">
                            Slug {!event && <span className="text-red-600">*</span>}
                        </label>
                        {event ? (
                            <div className="p-2 bg-gray-100 border border-gray-300 rounded text-sm font-mono text-gray-700">
                                {event.slug} (immutable)
                            </div>
                        ) : (
                            <input
                                id="slug"
                                name="slug"
                                required
                                pattern="^[a-z0-9]+(-[a-z0-9]+)*$"
                                className={inputClass}
                                placeholder="lowercase-kebab-case"
                            />
                        )}
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="category_id">
                            Category <span className="text-red-600">*</span>
                        </label>
                        <select
                            id="category_id"
                            name="category_id"
                            defaultValue={String(value("category_id") ?? "")}
                            className={inputClass}
                        >
                            <option value="">Select a category</option>
                            {categories.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="organizer_id">
                            Organizer
                        </label>
                        <select
                            id="organizer_id"
                            name="organizer_id"
                            defaultValue={String(value("organizer_id") ?? "")}
                            className={inputClass}
                        >
                            <option value="">Unknown / None</option>
                            {organizers.map(o => (
                                <option key={o.id} value={o.id}>
                                    {o.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="official_url">
                            Official Website URL (HTTPS)
                        </label>
                        <input
                            id="official_url"
                            name="official_url"
                            type="url"
                            defaultValue={String(value("official_url") ?? "")}
                            className={inputClass}
                            placeholder="https://..."
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="registration_url">
                            Registration URL (HTTPS)
                        </label>
                        <input
                            id="registration_url"
                            name="registration_url"
                            type="url"
                            defaultValue={String(value("registration_url") ?? "")}
                            className={inputClass}
                            placeholder="https://..."
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="image_url">
                            Cover Image URL (HTTPS)
                        </label>
                        <input
                            id="image_url"
                            name="image_url"
                            type="url"
                            defaultValue={String(value("image_url") ?? "")}
                            className={inputClass}
                            placeholder="https://..."
                        />
                    </div>
                </div>

                <div className="mt-3">
                    <label className={labelClass} htmlFor="short_description">
                        Short Description (up to 2,000 chars)
                    </label>
                    <textarea
                        id="short_description"
                        name="short_description"
                        rows={2}
                        defaultValue={String(value("short_description") ?? "")}
                        className={inputClass}
                        maxLength={2000}
                    />
                </div>

                <div className="mt-3">
                    <label className={labelClass} htmlFor="full_description">
                        Full Description (up to 20,000 chars)
                    </label>
                    <textarea
                        id="full_description"
                        name="full_description"
                        rows={5}
                        defaultValue={String(value("full_description") ?? "")}
                        className={inputClass}
                        maxLength={20000}
                    />
                </div>

                <div className="mt-3">
                    <label className={labelClass} htmlFor="participation_process">
                        Participation Process
                    </label>
                    <textarea
                        id="participation_process"
                        name="participation_process"
                        rows={3}
                        defaultValue={String(value("participation_process") ?? "")}
                        className={inputClass}
                        maxLength={20000}
                    />
                </div>
            </fieldset>

            {/* Fieldset 2: Mode & Location */}
            <fieldset className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                <legend className="font-bold text-gray-900 px-2 text-base">2. Mode & Location</legend>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                    <div>
                        <label className={labelClass} htmlFor="mode">
                            Mode
                        </label>
                        <select
                            id="mode"
                            name="mode"
                            defaultValue={String(value("mode") ?? "")}
                            className={inputClass}
                        >
                            <option value="">Unknown</option>
                            <option value="online">Online</option>
                            <option value="offline">Offline</option>
                            <option value="hybrid">Hybrid</option>
                        </select>
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="venue">
                            Venue
                        </label>
                        <input
                            id="venue"
                            name="venue"
                            defaultValue={String(value("venue") ?? "")}
                            className={inputClass}
                            placeholder="Campus / Hall"
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="city">
                            City
                        </label>
                        <input
                            id="city"
                            name="city"
                            defaultValue={String(value("city") ?? "")}
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="state">
                            State / Province
                        </label>
                        <input
                            id="state"
                            name="state"
                            defaultValue={String(value("state") ?? "")}
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="country">
                            Country (2-letter ISO)
                        </label>
                        <input
                            id="country"
                            name="country"
                            maxLength={2}
                            defaultValue={String(value("country") ?? "")}
                            className={inputClass}
                            placeholder="IN, US, GB"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className={labelClass} htmlFor="latitude">
                                Latitude
                            </label>
                            <input
                                id="latitude"
                                name="latitude"
                                type="number"
                                step="any"
                                defaultValue={value("latitude") == null ? "" : String(value("latitude"))}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className={labelClass} htmlFor="longitude">
                                Longitude
                            </label>
                            <input
                                id="longitude"
                                name="longitude"
                                type="number"
                                step="any"
                                defaultValue={value("longitude") == null ? "" : String(value("longitude"))}
                                className={inputClass}
                            />
                        </div>
                    </div>
                </div>
            </fieldset>

            {/* Fieldset 3: Schedule & Dates */}
            <fieldset className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                <legend className="font-bold text-gray-900 px-2 text-base">3. Schedule & Dates</legend>
                <p className="text-xs text-gray-600 mb-3">
                    Date-only precision requires local dates and no timestamps. Datetime precision requires exact matching local dates and timezone.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className={labelClass} htmlFor="date_precision">
                            Date Precision
                        </label>
                        <select
                            id="date_precision"
                            name="date_precision"
                            defaultValue={String(value("date_precision") ?? "unknown")}
                            className={inputClass}
                        >
                            <option value="unknown">Unknown</option>
                            <option value="date_only">Date Only</option>
                            <option value="datetime">Datetime (Exact)</option>
                        </select>
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="timezone">
                            Timezone
                        </label>
                        <input
                            id="timezone"
                            name="timezone"
                            defaultValue={String(value("timezone") ?? "")}
                            className={inputClass}
                            placeholder="e.g. Asia/Kolkata, UTC"
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="status">
                            Event Lifecycle Status
                        </label>
                        <select
                            id="status"
                            name="status"
                            defaultValue={String(value("status") ?? "announced")}
                            className={inputClass}
                        >
                            {choices.status.map(s => (
                                <option key={s} value={s}>
                                    {s}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="start_date">
                            Start Date (YYYY-MM-DD)
                        </label>
                        <input
                            id="start_date"
                            name="start_date"
                            type="text"
                            placeholder="YYYY-MM-DD"
                            defaultValue={String(value("start_date") ?? "")}
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="end_date">
                            End Date (YYYY-MM-DD)
                        </label>
                        <input
                            id="end_date"
                            name="end_date"
                            type="text"
                            placeholder="YYYY-MM-DD"
                            defaultValue={String(value("end_date") ?? "")}
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="registration_status">
                            Registration Status
                        </label>
                        <select
                            id="registration_status"
                            name="registration_status"
                            defaultValue={String(value("registration_status") ?? "unknown")}
                            className={inputClass}
                        >
                            {choices.registration_status.map(r => (
                                <option key={r} value={r}>
                                    {r}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="md:col-span-1">
                        <label className={labelClass} htmlFor="start_at">
                            Start At (ISO Instant)
                        </label>
                        <input
                            id="start_at"
                            name="start_at"
                            defaultValue={String(value("start_at") ?? "")}
                            className={inputClass}
                            placeholder="YYYY-MM-DDTHH:mm:ss+05:30"
                        />
                    </div>

                    <div className="md:col-span-1">
                        <label className={labelClass} htmlFor="end_at">
                            End At (ISO Instant)
                        </label>
                        <input
                            id="end_at"
                            name="end_at"
                            defaultValue={String(value("end_at") ?? "")}
                            className={inputClass}
                            placeholder="YYYY-MM-DDTHH:mm:ss+05:30"
                        />
                    </div>
                </div>
            </fieldset>

            {/* Fieldset 4: Participation & Fees */}
            <fieldset className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                <legend className="font-bold text-gray-900 px-2 text-base">4. Participation & Fees</legend>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                    <div>
                        <label className={labelClass} htmlFor="individual_allowed">
                            Individual Allowed
                        </label>
                        <select
                            id="individual_allowed"
                            name="individual_allowed"
                            defaultValue={value("individual_allowed") == null ? "" : String(value("individual_allowed"))}
                            className={inputClass}
                        >
                            <option value="">Unknown</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                        </select>
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="min_team_size">
                            Min Team Size
                        </label>
                        <input
                            id="min_team_size"
                            name="min_team_size"
                            type="number"
                            min="1"
                            defaultValue={value("min_team_size") == null ? "" : String(value("min_team_size"))}
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="max_team_size">
                            Max Team Size
                        </label>
                        <input
                            id="max_team_size"
                            name="max_team_size"
                            type="number"
                            min="1"
                            defaultValue={value("max_team_size") == null ? "" : String(value("max_team_size"))}
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="fee_status">
                            Fee Status
                        </label>
                        <select
                            id="fee_status"
                            name="fee_status"
                            defaultValue={String(value("fee_status") ?? "unknown")}
                            className={inputClass}
                        >
                            {choices.fee_status.map(f => (
                                <option key={f} value={f}>
                                    {f}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="fee">
                            Fee Amount
                        </label>
                        <input
                            id="fee"
                            name="fee"
                            type="number"
                            step="0.01"
                            defaultValue={value("fee") == null ? "" : String(value("fee"))}
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="currency">
                            Currency (3-letter ISO)
                        </label>
                        <input
                            id="currency"
                            name="currency"
                            maxLength={3}
                            defaultValue={String(value("currency") ?? "")}
                            className={inputClass}
                            placeholder="INR, USD"
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="prize_pool">
                            Prize Pool Amount
                        </label>
                        <input
                            id="prize_pool"
                            name="prize_pool"
                            type="number"
                            step="0.01"
                            defaultValue={value("prize_pool") == null ? "" : String(value("prize_pool"))}
                            className={inputClass}
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="prize_currency">
                            Prize Currency
                        </label>
                        <input
                            id="prize_currency"
                            name="prize_currency"
                            maxLength={3}
                            defaultValue={String(value("prize_currency") ?? "")}
                            className={inputClass}
                            placeholder="INR, USD"
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="prize_description">
                            Prize Description
                        </label>
                        <input
                            id="prize_description"
                            name="prize_description"
                            defaultValue={String(value("prize_description") ?? "")}
                            className={inputClass}
                            placeholder="Prizes, tracks, certificates"
                        />
                    </div>
                </div>
            </fieldset>

            {/* Fieldset 5: Controlled Tags (Interests & Skills) */}
            <fieldset className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                <legend className="font-bold text-gray-900 px-2 text-base">5. Controlled Tags</legend>
                <p className="text-xs text-gray-600 mb-3">
                    Tags are strictly restricted to the official vocabulary. Custom tags cannot be created.
                </p>

                {legacyTags.length > 0 && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded text-xs text-amber-800">
                        <span className="font-bold">Notice:</span> Existing event has {legacyTags.length} legacy tag(s) outside
                        the current vocabulary ({legacyTags.map(t => `${t.kind}:${t.tag}`).join(", ")}). These will be preserved.
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Domains (Interests) */}
                    <div>
                        <h4 className="font-semibold text-sm text-gray-900 mb-2">Domains ({interests.length})</h4>
                        <div className="border border-gray-200 rounded-md p-3 max-h-48 overflow-y-auto space-y-1.5 bg-gray-50">
                            {interests.length === 0 ? (
                                <p className="text-xs text-gray-500 italic">No interests configured in database.</p>
                            ) : (
                                interests.map(interest => {
                                    const checked = selectedTags.some(
                                        t => t.kind === "domain" && t.tag === interest.slug
                                    );
                                    return (
                                        <label
                                            key={interest.slug}
                                            className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer hover:text-black"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleDomain(interest.slug)}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span>{interest.name}</span>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Skills */}
                    <div>
                        <h4 className="font-semibold text-sm text-gray-900 mb-2">Skills ({skills.length})</h4>
                        <div className="border border-gray-200 rounded-md p-3 max-h-48 overflow-y-auto space-y-1.5 bg-gray-50">
                            {skills.length === 0 ? (
                                <p className="text-xs text-gray-500 italic">No skills configured in database.</p>
                            ) : (
                                skills.map(skill => {
                                    const checked = selectedTags.some(
                                        t => t.kind === "skill" && t.tag === skill.slug
                                    );
                                    return (
                                        <label
                                            key={skill.id}
                                            className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer hover:text-black"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleSkill(skill)}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span>{skill.name}</span>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-3 text-xs text-gray-500">
                    Selected: {selectedTags.filter(t => t.kind === "domain").length} domain(s),{" "}
                    {selectedTags.filter(t => t.kind === "skill").length} skill(s)
                </div>
            </fieldset>

            {/* Fieldset 6: Structured Deadlines */}
            <fieldset className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                <div className="flex justify-between items-center mb-2">
                    <legend className="font-bold text-gray-900 text-base">6. Structured Deadlines</legend>
                    <div className="space-x-2">
                        <button
                            type="button"
                            onClick={() => setShowRawDeadlines(!showRawDeadlines)}
                            className="text-xs text-gray-600 underline hover:text-black"
                        >
                            {showRawDeadlines ? "Hide Raw JSON" : "Show Raw JSON"}
                        </button>
                        <button
                            type="button"
                            onClick={addDeadline}
                            className="text-xs bg-blue-50 text-blue-700 font-medium px-2.5 py-1 rounded border border-blue-300 hover:bg-blue-100"
                        >
                            + Add Deadline
                        </button>
                    </div>
                </div>
                <p className="text-xs text-gray-600 mb-3">
                    Deadlines maintain stable IDs across edits. Only one active primary registration deadline is allowed.
                </p>

                {deadlineList.length === 0 ? (
                    <p className="text-xs text-gray-500 italic p-4 bg-gray-50 rounded border border-dashed text-center">
                        No deadlines defined. Click &quot;+ Add Deadline&quot; to add one.
                    </p>
                ) : (
                    <div className="space-y-3">
                        {deadlineList.map((d, idx) => (
                            <div
                                key={d.id ?? `new-${idx}`}
                                className="border border-gray-200 rounded-lg p-3 bg-gray-50 grid grid-cols-1 md:grid-cols-6 gap-3 items-end"
                            >
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-gray-700">Label</label>
                                    <input
                                        type="text"
                                        value={d.label}
                                        onChange={e => updateDeadline(idx, { label: e.target.value })}
                                        className="w-full border border-gray-300 rounded p-1.5 text-xs bg-white mt-1"
                                        placeholder="e.g. Registration closes"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700">Kind</label>
                                    <select
                                        value={d.kind}
                                        onChange={e => updateDeadline(idx, { kind: e.target.value })}
                                        className="w-full border border-gray-300 rounded p-1.5 text-xs bg-white mt-1"
                                    >
                                        <option value="registration">Registration</option>
                                        <option value="submission">Submission</option>
                                        <option value="stage">Stage</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700">Precision</label>
                                    <select
                                        value={d.precision}
                                        onChange={e => updateDeadline(idx, { precision: e.target.value })}
                                        className="w-full border border-gray-300 rounded p-1.5 text-xs bg-white mt-1"
                                    >
                                        <option value="date_only">Date Only</option>
                                        <option value="datetime">Datetime</option>
                                        <option value="unknown">Unknown</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700">Local Date</label>
                                    <input
                                        type="text"
                                        placeholder="YYYY-MM-DD"
                                        value={d.local_date ?? ""}
                                        onChange={e => updateDeadline(idx, { local_date: e.target.value || null })}
                                        className="w-full border border-gray-300 rounded p-1.5 text-xs bg-white mt-1"
                                    />
                                </div>

                                <div className="flex items-center space-x-2">
                                    <button
                                        type="button"
                                        onClick={() => removeDeadline(idx)}
                                        className="text-xs text-red-600 hover:text-red-800 font-semibold p-1"
                                    >
                                        Remove
                                    </button>
                                </div>

                                {d.precision === "datetime" && (
                                    <>
                                        <div className="md:col-span-3">
                                            <label className="block text-xs font-medium text-gray-700">Due At (ISO Instant)</label>
                                            <input
                                                type="text"
                                                placeholder="YYYY-MM-DDTHH:mm:ss+05:30"
                                                value={d.due_at ?? ""}
                                                onChange={e => updateDeadline(idx, { due_at: e.target.value || null })}
                                                className="w-full border border-gray-300 rounded p-1.5 text-xs bg-white mt-1"
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className="block text-xs font-medium text-gray-700">Timezone</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Asia/Kolkata"
                                                value={d.timezone ?? ""}
                                                onChange={e => updateDeadline(idx, { timezone: e.target.value || null })}
                                                className="w-full border border-gray-300 rounded p-1.5 text-xs bg-white mt-1"
                                            />
                                        </div>
                                    </>
                                )}

                                <div className="md:col-span-6 flex items-center space-x-6 pt-1 border-t border-gray-200 mt-2">
                                    <label className="flex items-center space-x-1.5 text-xs text-gray-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={d.active}
                                            onChange={e => updateDeadline(idx, { active: e.target.checked })}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span>Active</span>
                                    </label>
                                    <label className="flex items-center space-x-1.5 text-xs text-gray-700 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={d.is_primary}
                                            onChange={e => updateDeadline(idx, { is_primary: e.target.checked })}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span>Primary Registration Deadline</span>
                                    </label>
                                    {d.id && (
                                        <span className="text-[10px] font-mono text-gray-400">
                                            ID: {d.id}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {showRawDeadlines && (
                    <div className="mt-4">
                        <label className="block text-xs font-mono text-gray-600 mb-1">Raw Deadlines JSON (Read-only view)</label>
                        <pre className="p-3 bg-gray-900 text-green-400 rounded text-xs overflow-x-auto">
                            {JSON.stringify(cleanedDeadlines, null, 2)}
                        </pre>
                    </div>
                )}
            </fieldset>

            {/* Fieldset 7: Eligibility & Academic Requirements */}
            <fieldset className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                <legend className="font-bold text-gray-900 px-2 text-base">7. Eligibility & Academic Requirements</legend>
                <p className="text-xs text-gray-600 mb-4">
                    Eligible years, eligible degrees, and eligibility rules are independent database columns. Editing one does not overwrite another.
                </p>

                {/* 7a. Eligible Years Checkboxes */}
                <div className="mb-6 p-4 border border-gray-200 rounded bg-gray-50">
                    <h4 className="font-semibold text-sm text-gray-900 mb-2">Eligible Study Years (Database Column)</h4>
                    <p className="text-xs text-gray-600 mb-3">
                        Select applicable study years. If no years are checked, value is saved as unknown (null).
                    </p>
                    <div className="flex flex-wrap gap-4">
                        {[1, 2, 3, 4, 5, 6].map(yr => {
                            const isChecked = eligibleYears?.includes(yr) ?? false;
                            return (
                                <label key={yr} className="flex items-center space-x-2 text-xs text-gray-800 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleYear(yr)}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>Year {yr}</span>
                                </label>
                            );
                        })}
                    </div>
                    <div className="mt-2 text-xs text-gray-500">
                        Current value: {eligibleYears && eligibleYears.length > 0 ? `[${eligibleYears.join(", ")}]` : "Unknown (null)"}
                    </div>
                </div>

                {/* 7b. Eligible Degrees Input */}
                <div className="mb-6 p-4 border border-gray-200 rounded bg-gray-50">
                    <h4 className="font-semibold text-sm text-gray-900 mb-2">Eligible Degrees (Database Column)</h4>
                    <p className="text-xs text-gray-600 mb-2">
                        Enter comma-separated degree names. Preserved as exact strings without taxonomy (e.g. &quot;B.Tech, B.E., BCA&quot;).
                    </p>
                    <input
                        type="text"
                        value={degreesInput}
                        onChange={e => setDegreesInput(e.target.value)}
                        placeholder="e.g. B.Tech, B.E., BCA, MCA"
                        className={inputClass}
                    />
                    <div className="text-xs text-gray-500">
                        Parsed: {parsedDegrees.length > 0 ? JSON.stringify(parsedDegrees) : "Unknown (null)"}
                    </div>
                </div>

                {/* 7c. Freeform Eligibility Text */}
                <div className="mb-6">
                    <label className={labelClass} htmlFor="eligibility_text">
                        Freeform Eligibility Description
                    </label>
                    <textarea
                        id="eligibility_text"
                        name="eligibility_text"
                        rows={2}
                        defaultValue={String(value("eligibility_text") ?? "")}
                        className={inputClass}
                        maxLength={20000}
                        placeholder="Human-readable eligibility notes from official rules"
                    />
                </div>

                {/* 7d. Structured Eligibility Rules (AST) */}
                <div className="p-4 border border-blue-200 rounded-lg bg-blue-50/50">
                    <h4 className="font-semibold text-sm text-gray-900 mb-1">Eligibility Rules AST (Version 1 Structure)</h4>
                    <p className="text-xs text-gray-600 mb-4">
                        Structured rules used by the matching engine. Presets never fabricate evidence; explicit evidence text is required.
                    </p>

                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Evidence quote / source reference:
                            </label>
                            <input
                                type="text"
                                value={presetEvidence}
                                onChange={e => setPresetEvidence(e.target.value)}
                                placeholder='e.g. "Rule 3: Enrolled college students only"'
                                className="w-full border border-gray-300 rounded p-1.5 text-xs bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Reason for unresolved:
                            </label>
                            <input
                                type="text"
                                value={presetReason}
                                onChange={e => setPresetReason(e.target.value)}
                                placeholder='e.g. "Brochure missing academic eligibility section"'
                                className="w-full border border-gray-300 rounded p-1.5 text-xs bg-white"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                        <button
                            type="button"
                            onClick={() => applyPreset("all_students")}
                            className="text-xs bg-white border border-gray-300 hover:border-blue-500 font-medium px-3 py-1.5 rounded shadow-sm"
                        >
                            Preset: All Students
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset("specific_years")}
                            className="text-xs bg-white border border-gray-300 hover:border-blue-500 font-medium px-3 py-1.5 rounded shadow-sm"
                        >
                            Preset: Specific Years (1–4)
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset("unrestricted")}
                            className="text-xs bg-white border border-gray-300 hover:border-blue-500 font-medium px-3 py-1.5 rounded shadow-sm"
                        >
                            Preset: Unrestricted
                        </button>
                        <button
                            type="button"
                            onClick={() => applyPreset("unresolved")}
                            className="text-xs bg-white border border-gray-300 hover:border-blue-500 font-medium px-3 py-1.5 rounded shadow-sm"
                        >
                            Preset: Unresolved
                        </button>
                        <button
                            type="button"
                            onClick={() => setEligibilityRulesJson("")}
                            className="text-xs bg-white border border-gray-300 hover:border-red-500 text-red-600 font-medium px-3 py-1.5 rounded shadow-sm"
                        >
                            Clear (Null / Unknown)
                        </button>
                    </div>

                    <div>
                        <label className="block text-xs font-mono text-gray-700 mb-1">
                            Eligibility Rules JSON (blank = unknown):
                        </label>
                        <textarea
                            rows={6}
                            value={eligibilityRulesJson}
                            onChange={e => setEligibilityRulesJson(e.target.value)}
                            className="w-full font-mono text-xs border border-gray-300 rounded p-2 bg-white"
                            placeholder="Enter AST JSON or use a preset above..."
                        />
                    </div>
                </div>
            </fieldset>

            {/* Fieldset 8: Verification Metadata */}
            <fieldset className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                <legend className="font-bold text-gray-900 px-2 text-base">8. Verification Metadata</legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div>
                        <label className={labelClass} htmlFor="verification_status">
                            Verification Status
                        </label>
                        <select
                            id="verification_status"
                            name="verification_status"
                            defaultValue={String(value("verification_status") ?? "pending")}
                            className={inputClass}
                        >
                            {choices.verification_status.map(v => (
                                <option key={v} value={v}>
                                    {v}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="verification_level">
                            Verification Level
                        </label>
                        <select
                            id="verification_level"
                            name="verification_level"
                            defaultValue={String(value("verification_level") ?? "")}
                            className={inputClass}
                        >
                            <option value="">Unknown</option>
                            {choices.verification_level.map(l => (
                                <option key={l} value={l}>
                                    {l}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="last_checked_at">
                            Last Checked At (ISO Instant)
                        </label>
                        <input
                            id="last_checked_at"
                            name="last_checked_at"
                            defaultValue={String(value("last_checked_at") ?? "")}
                            className={inputClass}
                            placeholder="YYYY-MM-DDTHH:mm:ss+05:30"
                        />
                    </div>

                    <div>
                        <label className={labelClass} htmlFor="source_updated_at">
                            Source Updated At (ISO Instant)
                        </label>
                        <input
                            id="source_updated_at"
                            name="source_updated_at"
                            defaultValue={String(value("source_updated_at") ?? "")}
                            className={inputClass}
                            placeholder="YYYY-MM-DDTHH:mm:ss+05:30"
                        />
                    </div>
                </div>
            </fieldset>

            {/* Fieldset 9: Audit Information */}
            <fieldset className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm">
                <legend className="font-bold text-gray-900 px-2 text-base">9. Change Reason & Audit</legend>
                <div className="mt-2">
                    <label className={labelClass} htmlFor="reason">
                        Reason for this change <span className="text-red-600">*</span>
                    </label>
                    <p className="text-xs text-gray-600 mb-2">
                        Recorded permanently in the immutable audit history (`event_changes`). Minimum 1 char, maximum 1000 chars.
                    </p>
                    <input
                        id="reason"
                        name="reason"
                        required
                        maxLength={1000}
                        className={inputClass}
                        placeholder="e.g. Verified registration deadline against official brochure"
                    />
                </div>
            </fieldset>

            {/* Submit Action */}
            <div className="flex items-center space-x-4 pt-4">
                <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-md shadow focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition"
                >
                    {event ? "Save Changes" : "Create Draft"}
                </button>
                <a
                    href="/admin"
                    className="text-sm text-gray-600 hover:text-gray-900 underline"
                >
                    Cancel
                </a>
            </div>
        </form>
    );
}
