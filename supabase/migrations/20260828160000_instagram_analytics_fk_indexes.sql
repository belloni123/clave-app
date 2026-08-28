-- Cover every Instagram Analytics foreign key used by deletes and joins.
create index instagram_connections_connected_by_idx
  on public.instagram_connections(connected_by);

create index instagram_media_connection_idx
  on public.instagram_media(connection_id);

create index instagram_media_insights_connection_idx
  on public.instagram_media_insights(connection_id);

create index instagram_sync_runs_connection_idx
  on public.instagram_sync_runs(connection_id);
