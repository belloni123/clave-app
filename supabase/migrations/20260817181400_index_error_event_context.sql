create index app_error_events_form_occurred_idx
  on public.app_error_events(form_id, occurred_at desc)
  where form_id is not null;

create index app_error_events_submission_occurred_idx
  on public.app_error_events(submission_id, occurred_at desc)
  where submission_id is not null;
