-- Temporary passwords are only an onboarding flag. Auth stores the password hash;
-- the plaintext is never persisted in public tables.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- The browser can update ordinary profile fields, but only the server-side
-- password-change route may clear this onboarding flag.
revoke update on table public.profiles from authenticated;
grant update (nome, email) on table public.profiles to authenticated;

comment on column public.profiles.must_change_password is
  'Forces the account holder to replace an administrator-provided temporary password.';
