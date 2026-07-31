# Security Policy

## Supported Version

Security fixes are maintained on the `main` branch. Deployments should use a
reviewed commit from `main` and apply all Supabase migrations tracked in the
repository before the application image is replaced.

## Reporting A Vulnerability

Do not open a public issue with credentials, customer data, or exploit details.
Use GitHub's private vulnerability reporting for this repository so the
maintainers can validate and remediate the report before disclosure.

Include the affected route or file, reproduction preconditions, expected and
observed behavior, and whether any live data was touched. Do not test against
production or another tenant without explicit authorization.

## Secrets

Runtime secrets must stay in the deployment platform or a local ignored
environment file. Never commit `.env*`, service-role keys, API keys, database
passwords, access tokens, or production exports.

`SUPABASE_SERVICE_ROLE_KEY` is server-only and may be used only through
`utils/supabase/admin.ts`. Every route using it must authenticate the caller
with `auth.getUser()` and perform an explicit authorization check before
creating an admin client. The key must be runtime-only in Coolify.

`SUPABASE_MANAGEMENT_ACCESS_TOKEN` is also server-only and runtime-only. It may
only be used by `/api/admin/smtp` after validating an administrator and the
explicit SMTP editor allowlist. SMTP passwords are stored in Supabase Vault;
they must never be logged, returned to the browser, committed, or shared in
chat.

## Project And Module Isolation

Hiding a navigation item is not an authorization control. Project membership
and module permissions must also be enforced by Supabase RLS. New
project-scoped tables must use `user_has_project_module_access` or an
equivalent hardened `SECURITY DEFINER` helper with an explicit `search_path`.

Only project administrators may write `project_users`. A regular viewer or
editor may read their own membership, but cannot grant access or change
another user's modules.
