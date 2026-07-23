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
