-- C16: preserve the existing bookmarks table, ownership policies and FKs.
-- A 5,028-save isolated plan showed a full per-user sort. This index supports
-- recent-first keyset traversal and early LIMIT without that sort.
begin;
create index saved_events_user_order_idx on public.saved_events(user_id,created_at desc,event_id desc);
commit;
