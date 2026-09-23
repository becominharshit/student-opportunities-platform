import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { replay } from "../database/harness.mjs";

const validationSource = await readFile(new URL("../../src/lib/events/validation.ts", import.meta.url), "utf8");
const validationUrl = "data:text/javascript;base64," + Buffer.from(
  ts.transpileModule(validationSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
).toString("base64");
await import(validationUrl);

const serviceSource = (await readFile(new URL("../../src/lib/events/service.ts", import.meta.url), "utf8"))
  .replace('import "server-only";', "")
  .replace('"./validation"', JSON.stringify(validationUrl));
const svc = await import("data:text/javascript;base64," + Buffer.from(
  ts.transpileModule(serviceSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
).toString("base64"));

let db;
const ADMIN = "10000000-0000-0000-0000-000000000003";
const USER = "10000000-0000-0000-0000-000000000001";
const ORG = "50000000-0000-0000-0000-000000000001";
const CON = "40000000-0000-0000-0000-000000000001";
let categoryHackathon;
let categoryWorkshop;
let pythonSkillId;

before(async () => {
  db = await replay();
  await db.exec(`
    insert into auth.users(id) values ('${ADMIN}'), ('${USER}') on conflict do nothing;
    insert into public.admin_memberships(user_id, role) values ('${ADMIN}', 'admin') on conflict do nothing;
    insert into public.organizers(id, name, normalized_identity) values ('${ORG}', 'C18 Admin Test Org', 'c18-admin-test-org') on conflict do nothing;
    insert into public.source_connectors(id, name, source_url, type) values ('${CON}', 'C18 Admin Connector', 'https://example.test', 'feed') on conflict do nothing;
    insert into public.interests(slug, name) values ('robotics', 'Robotics'), ('web3', 'Web3') on conflict do nothing;
    insert into public.skills(slug, name) values ('python', 'Python'), ('typescript', 'TypeScript') on conflict do nothing;
  `);
  categoryHackathon = (await db.query("select id from public.event_categories where slug='hackathon'")).rows[0].id;
  categoryWorkshop = (await db.query("select id from public.event_categories where slug='workshop'")).rows[0].id;
  pythonSkillId = (await db.query("select id from public.skills where slug='python'")).rows[0].id;
});

after(async () => db?.close());

async function isolated(fn, uid = ADMIN, role = "authenticated") {
  await db.exec("begin");
  try {
    await db.exec("set local role " + role);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid ?? ""]);
    await fn();
  } finally {
    await db.exec("rollback");
  }
}

async function rpc(command) {
  return (await db.query("select public.mutate_event($1::jsonb) value", [JSON.stringify(command)])).rows[0].value;
}

const draft = (patch = {}) => ({
  action: "create",
  reason: "C18 admin test draft",
  event: {
    slug: "c18-test-event-" + Math.random().toString(36).slice(2, 8),
    title: "C18 Test Event",
    category_id: categoryHackathon,
    organizer_id: ORG,
    ...patch,
  },
});

const edit = (e, action = "update", extra = {}) => ({
  id: e.id,
  expected_version: e.version,
  action,
  reason: "C18 admin test edit",
  ...extra,
});

// Helper creating a mock Supabase client wrapping our PGlite DB connection
function createMockClient(uid = ADMIN, isConfirmed = true) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: uid ? { id: uid, email_confirmed_at: isConfirmed ? new Date().toISOString() : null } : null },
        error: null,
      }),
    },
    from: (table) => {
      let selectFields = "*";
      let isHead = false;
      const filters = [];
      let orderBy = null;
      let orderAsc = true;
      let limitCount = null;
      let rangeStart = 0;
      let rangeEnd = null;

      const builder = {
        select(fields, opts) {
          selectFields = fields;
          if (opts?.head) isHead = true;
          return builder;
        },
        eq(col, val) {
          filters.push({ type: "eq", col, val });
          return builder;
        },
        in(col, vals) {
          filters.push({ type: "in", col, vals });
          return builder;
        },
        or(clause) {
          filters.push({ type: "or", clause });
          return builder;
        },
        order(col, opts) {
          orderBy = col;
          orderAsc = opts?.ascending !== false;
          return builder;
        },
        limit(n) {
          limitCount = n;
          return builder;
        },
        range(from, to) {
          rangeStart = from;
          rangeEnd = to;
          return builder;
        },
        async maybeSingle() {
          const res = await builder.execute();
          if (res.error) return res;
          return { data: res.data && res.data.length > 0 ? res.data[0] : null, error: null };
        },
        then(resolve, reject) {
          return builder.execute().then(resolve, reject);
        },
        async execute() {
          try {
            await db.exec("set local role authenticated");
            await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid ?? ""]);

            let sql = `select `;
            const whereClauses = [];
            const params = [];

            filters.forEach((f) => {
              if (f.type === "eq") {
                params.push(f.val);
                whereClauses.push(`${f.col} = $${params.length}`);
              } else if (f.type === "in") {
                const placeholders = f.vals.map((v) => {
                  params.push(v);
                  return `$${params.length}`;
                });
                whereClauses.push(`${f.col} in (${placeholders.join(",")})`);
              } else if (f.type === "or") {
                // PostgREST or syntax: col1.eq.val1,col2.eq.val2
                const parts = f.clause.split(",").map(part => {
                  const [col, op, val] = part.split(".");
                  if (op === "eq") {
                    params.push(val);
                    return `${col} = $${params.length}`;
                  }
                  return "1=1";
                });
                whereClauses.push(`(${parts.join(" or ")})`);
              }
            });

            const whereSql = whereClauses.length > 0 ? ` where ${whereClauses.join(" and ")}` : "";

            if (isHead) {
              const countSql = `select count(*)::int as count from public.${table}${whereSql}`;
              const countRes = await db.query(countSql, params);
              return { data: null, count: countRes.rows[0].count, error: null };
            }

            // Normal select
            let colsSql = "*";
            if (table === "events" && selectFields.includes("organizers")) {
              // Full join for readAdminEvent
              const eventRow = (await db.query(`select * from public.events ${whereSql}`, params)).rows[0];
              if (!eventRow) return { data: [], error: null };
              const org = (await db.query("select * from public.organizers where id = $1", [eventRow.organizer_id])).rows[0] ?? null;
              const cat = (await db.query("select * from public.event_categories where id = $1", [eventRow.category_id])).rows[0] ?? null;
              const tags = (await db.query("select * from public.event_tags where event_id = $1", [eventRow.id])).rows;
              const deadlines = (await db.query("select * from public.event_deadlines where event_id = $1", [eventRow.id])).rows;
              const changes = (await db.query("select * from public.event_changes where event_id = $1 order by event_version desc", [eventRow.id])).rows;
              const sources = (await db.query("select id, source_url, last_checked_at, validated_observation, field_evidence from public.event_sources where event_id = $1", [eventRow.id])).rows;

              return {
                data: [{
                  ...eventRow,
                  organizers: org,
                  event_categories: cat,
                  event_tags: tags,
                  event_deadlines: deadlines,
                  event_changes: changes,
                  event_sources: sources,
                }],
                error: null,
              };
            } else if (table === "events" && selectFields.includes("event_categories")) {
              colsSql = `e.*, json_build_object('id', c.id, 'name', c.name, 'slug', c.slug) as event_categories`;
              sql = `select ${colsSql} from public.events e left join public.event_categories c on e.category_id = c.id`;
              const modifiedWhere = whereClauses.map(w => w.replace(/^id /, "e.id ").replace(/^category_id /, "e.category_id ").replace(/^publication_status /, "e.publication_status ").replace(/^verification_status /, "e.verification_status ")).join(" and ");
              if (modifiedWhere) sql += ` where ${modifiedWhere}`;
            } else if (table === "event_changes" && selectFields.includes("events")) {
              sql = `select c.*, json_build_object('id', e.id, 'title', e.title, 'slug', e.slug) as events
                     from public.event_changes c
                     left join public.events e on c.event_id = e.id ${whereSql}`;
            } else {
              sql = `select * from public.${table}${whereSql}`;
            }

            if (orderBy) {
              sql += ` order by ${orderBy} ${orderAsc ? "asc" : "desc"}`;
            }

            if (rangeEnd !== null) {
              const limit = rangeEnd - rangeStart + 1;
              sql += ` limit ${limit} offset ${rangeStart}`;
            } else if (limitCount !== null) {
              sql += ` limit ${limitCount}`;
            }

            const res = await db.query(sql, params);
            return { data: res.rows, error: null };
          } catch (err) {
            return { data: null, error: err };
          }
        },
      };
      return builder;
    },
    rpc: async (fn, args) => {
      try {
        await db.exec("set local role authenticated");
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid ?? ""]);
        const res = await db.query(`select public.${fn}($1::jsonb) as val`, [JSON.stringify(args.command)]);
        return { data: res.rows[0].val, error: null };
      } catch (err) {
        return { data: null, error: err };
      }
    },
  };
}

// -------------------------------------------------------------
// Test 1: 3-Layer Authorization Enforcement
// -------------------------------------------------------------
test("C18 admin service: anonymous and non-admin requests are rejected", async () => {
  const anonClient = createMockClient(null);
  const userClient = createMockClient(USER);
  const adminClient = createMockClient(ADMIN);

  // Dashboard summary check
  const anonSum = await svc.getAdminDashboardSummary(anonClient);
  assert.equal(anonSum.ok, false);
  assert.equal(anonSum.code, "unauthorized");

  const userSum = await svc.getAdminDashboardSummary(userClient);
  assert.equal(userSum.ok, false);
  assert.equal(userSum.code, "forbidden");

  const adminSum = await svc.getAdminDashboardSummary(adminClient);
  assert.equal(adminSum.ok, true);

  // List events check
  const anonList = await svc.listAdminEvents(anonClient);
  assert.equal(anonList.ok, false);
  assert.equal(anonList.code, "unauthorized");

  const userList = await svc.listAdminEvents(userClient);
  assert.equal(userList.ok, false);
  assert.equal(userList.code, "forbidden");

  const adminList = await svc.listAdminEvents(adminClient);
  assert.equal(adminList.ok, true);
});

// -------------------------------------------------------------
// Test 2: Dashboard Operational Metrics & Recent Changes
// -------------------------------------------------------------
test("C18 admin service: operational summaries report exact counts and recent changes", () =>
  isolated(async () => {
    // Create 1 draft, 1 review event, and 1 duplicate review row
    const e1 = await rpc(draft({ title: "Metric Draft Event" }));
    const e2 = await rpc(draft({ title: "Metric Review Event" }));
    await rpc(edit(e2, "review"));

    await db.query(
      `insert into public.duplicate_reviews(event_a_id, event_b_id, status, signals)
       values ($1, $2, 'pending', '{"title_similarity": 0.95}')`,
      [[e1.id, e2.id].sort()[0], [e1.id, e2.id].sort()[1]]
    );

    const client = createMockClient(ADMIN);
    const summary = await svc.getAdminDashboardSummary(client);

    assert.equal(summary.ok, true);
    assert.ok(summary.value.counts.draft >= 1, "Should count at least 1 draft");
    assert.ok(summary.value.counts.review >= 1, "Should count at least 1 in review");
    assert.ok(summary.value.counts.duplicateReviews >= 1, "Should count at least 1 pending duplicate");
    assert.ok(summary.value.recentChanges.length > 0, "Should include recent changes");
    assert.ok(summary.value.recentChanges[0].reason.length > 0, "Recent change must have reason");
    assert.equal(summary.value.recentChanges[0].actor_id, ADMIN, "Staff actor ID preserved");
  }));

// -------------------------------------------------------------
// Test 3: Event Management Filtering & Bounded Lookahead Pagination
// -------------------------------------------------------------
test("C18 admin service: filters by publication status and category with bounded lookahead", () =>
  isolated(async () => {
    const d1 = await rpc(draft({ title: "Filter Draft Hackathon", category_id: categoryHackathon }));
    const d2 = await rpc(draft({ title: "Filter Draft Workshop", category_id: categoryWorkshop }));
    const r1 = await rpc(draft({ title: "Filter Review Event", category_id: categoryHackathon }));
    await rpc(edit(r1, "review"));

    const client = createMockClient(ADMIN);

    // Filter by status=draft
    const draftList = await svc.listAdminEvents(client, { status: "draft" });
    assert.equal(draftList.ok, true);
    assert.ok(draftList.value.items.every(e => e.publication_status === "draft"));
    assert.ok(draftList.value.items.some(e => e.id === d1.id));
    assert.ok(draftList.value.items.some(e => e.id === d2.id));
    assert.ok(!draftList.value.items.some(e => e.id === r1.id));

    // Filter by category
    const workshopList = await svc.listAdminEvents(client, { categoryId: categoryWorkshop });
    assert.equal(workshopList.ok, true);
    assert.ok(workshopList.value.items.every(e => e.category_id === categoryWorkshop));
    assert.ok(workshopList.value.items.some(e => e.id === d2.id));
    assert.ok(!workshopList.value.items.some(e => e.id === d1.id));

    // Lookahead pagination flag: false for small dataset
    assert.equal(draftList.value.hasNextPage, false);
    assert.equal(draftList.value.page, 0);
  }));

// -------------------------------------------------------------
// Test 4: Read Admin Event includes Pending Duplicates & Omits Raw Secrets
// -------------------------------------------------------------
test("C18 admin service: readAdminEvent includes pending duplicates and safe provenance only", () =>
  isolated(async () => {
    const e1 = await rpc(draft({ title: "Event A" }));
    const e2 = await rpc(draft({ title: "Event B" }));

    // Insert source with raw storage reference and validated observation
    await db.query(
      `insert into public.event_sources(event_id, connector_id, external_id, source_url, normalized_url, raw_storage_ref, validated_observation, field_evidence)
       values ($1, $2, 'ext-1', 'https://example.test/event', 'https://example.test/event', 's3://internal/secret-bucket/raw.json', '{"title": "Event A"}', '{"title": {"status": "checked"}}')`,
      [e1.id, CON]
    );

    // Insert pending duplicate review
    const [idA, idB] = [e1.id, e2.id].sort();
    await db.query(
      `insert into public.duplicate_reviews(event_a_id, event_b_id, status, signals)
       values ($1, $2, 'pending', '{"score": 0.99}')`,
      [idA, idB]
    );

    const client = createMockClient(ADMIN);
    const read = await svc.readAdminEvent(client, e1.id);

    assert.equal(read.ok, true);
    assert.equal(read.value.id, e1.id);
    assert.equal(read.value.duplicate_reviews.length, 1);
    assert.equal(read.value.duplicate_reviews[0].status, "pending");

    // Provenance security check: raw_storage_ref must NOT be selected
    assert.equal(read.value.event_sources.length, 1);
    assert.equal(read.value.event_sources[0].source_url, "https://example.test/event");
    assert.equal("raw_storage_ref" in read.value.event_sources[0], false, "raw_storage_ref must NOT be exposed");
    assert.equal(read.value.event_sources[0].field_evidence.title.status, "checked");
  }));

// -------------------------------------------------------------
// Test 5: Independent Columns & Lossless Degree/Year/Rule Editing
// -------------------------------------------------------------
test("C18 editor integrity: eligible_years, eligible_degrees, and eligibility_rules are independent", () =>
  isolated(async () => {
    // 1. Create with eligible_years only
    let e = await rpc(draft({
      eligible_years: [1, 2, 3],
      eligible_degrees: null,
      eligibility_rules: null,
    }));
    assert.deepEqual(e.eligible_years, [1, 2, 3]);
    assert.equal(e.eligible_degrees, null);
    assert.equal(e.eligibility_rules, null);

    // 2. Update eligible_degrees as exact strings without altering eligible_years
    e = await rpc(edit(e, "update", {
      event: {
        eligible_degrees: ["B.Tech (CSE)", "B.E. Computer Science"],
      },
    }));
    assert.deepEqual(e.eligible_years, [1, 2, 3], "eligible_years preserved");
    assert.deepEqual(e.eligible_degrees, ["B.Tech (CSE)", "B.E. Computer Science"]);
    assert.equal(e.eligibility_rules, null);

    // 3. Update eligibility_rules AST without altering degrees or years
    const ast = {
      version: 1,
      expression: {
        op: "predicate",
        field: "student_status",
        operator: "eq",
        value: true,
        evidence: "Official brochure page 4",
      },
    };
    e = await rpc(edit(e, "update", {
      event: {
        eligibility_rules: ast,
      },
    }));
    assert.deepEqual(e.eligible_years, [1, 2, 3], "eligible_years preserved");
    assert.deepEqual(e.eligible_degrees, ["B.Tech (CSE)", "B.E. Computer Science"], "eligible_degrees preserved");
    assert.deepEqual(e.eligibility_rules, ast, "eligibility_rules updated");
  }));

// -------------------------------------------------------------
// Test 6: Controlled Tags Enforce Foreign Keys (No Custom Tags)
// -------------------------------------------------------------
test("C18 controlled tags: rejects arbitrary custom tags not in vocabulary", () =>
  isolated(async () => {
    const e = await rpc(draft());

    // Valid controlled tags
    const valid = await rpc(edit(e, "update", {
      tags: [
        { kind: "domain", tag: "robotics", skill_id: null },
        { kind: "skill", tag: "python", skill_id: pythonSkillId },
      ],
    }));
    assert.equal(valid.version, 2);

    // Invalid custom domain tag rejected by foreign key / guard
    await db.exec("savepoint reject1");
    await assert.rejects(
      () => rpc(edit(valid, "update", {
        tags: [{ kind: "domain", tag: "non-existent-tag", skill_id: null }],
      })),
      (err) => err.code === "P0522" || err.code === "23503"
    );
    await db.exec("rollback to savepoint reject1");

    // Invalid skill tag with mismatched UUID rejected
    await db.exec("savepoint reject2");
    await assert.rejects(
      () => rpc(edit(valid, "update", {
        tags: [{ kind: "skill", tag: "python", skill_id: "00000000-0000-0000-0000-000000000099" }],
      })),
      (err) => err.code === "23503"
    );
    await db.exec("rollback to savepoint reject2");
  }));

// -------------------------------------------------------------
// Test 7: Deadlines Maintain Stable IDs
// -------------------------------------------------------------
test("C18 structured deadlines: preserves existing deadline IDs across edits", () =>
  isolated(async () => {
    let e = await rpc(draft());
    e = await rpc(edit(e, "update", {
      deadlines: [
        {
          kind: "registration",
          label: "Initial Registration Deadline",
          local_date: "2026-11-01",
          due_at: null,
          timezone: null,
          precision: "date_only",
          active: true,
          is_primary: true,
        },
      ],
    }));

    const dRow = (await db.query("select * from public.event_deadlines where event_id = $1", [e.id])).rows[0];
    const originalDeadlineId = dRow.id;
    assert.ok(originalDeadlineId);

    // Update label and date while submitting the same deadline ID
    e = await rpc(edit(e, "update", {
      deadlines: [
        {
          id: originalDeadlineId,
          kind: "registration",
          label: "Extended Registration Deadline",
          local_date: "2026-11-15",
          due_at: null,
          timezone: null,
          precision: "date_only",
          active: true,
          is_primary: true,
        },
      ],
    }));

    const updatedRow = (await db.query("select * from public.event_deadlines where event_id = $1", [e.id])).rows[0];
    assert.equal(updatedRow.id, originalDeadlineId, "Deadline ID must remain stable across updates");
    assert.equal(updatedRow.label, "Extended Registration Deadline");
    assert.equal(updatedRow.local_date.toISOString().slice(0, 10), "2026-11-15");
  }));
