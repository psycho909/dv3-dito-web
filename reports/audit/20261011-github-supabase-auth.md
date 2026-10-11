# Independent Audit — Supabase GitHub Login

## Scope

- Authority: [`20261011-github-supabase-auth`](../../tickets/20261011-github-supabase-auth.md), L3.
- Baseline and review HEAD: `07706762d87eb1c9055f066faf3e24e72c513cb1`; changes were unstaged with four untracked files during the audit. The auditor reviewed the full unstaged diff and read all task-related untracked files. The subsequent two-file error-handling adjustment was rechecked independently.
- Review commands: `git diff --cached -- <task paths>`, `git diff -- <task paths>`, `git diff 07706762d87eb1c9055f066faf3e24e72c513cb1...HEAD -- <task paths>`, `git ls-files --others --exclude-standard`, and `git diff --check -- <task paths>`.
- Reviewer: independent auditor `github_auth_audit`, gpt-6-luna Max; did not participate in implementation and made no edits.

## Review

No code-scope blocker remains. With missing or malformed optional Supabase settings, client initialization falls back to `null`, and the panel preserves local-only play. The audit confirmed that GitHub authentication only manages the Supabase Auth session; it does not upload game records or clear the `dito-forge:local:v1` record key. Sign-out uses `scope: 'local'`. The UI distinguishes a remaining session from a locally removed session when remote revocation fails. The CSP adds only the selected project's Supabase origin, and browser code consumes only the publishable key.

The UI explicitly states that GitHub login does not sync game records. The SDK integration uses the site origin as OAuth `redirectTo`; the required GitHub callback and allow-list entries are documented. The actual Supabase provider and redirect allow list remain unconfigured.

## Verification and Limits

Primary-agent verification on 2026-10-11:

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run build` — passed; 122 modules transformed.
- `git diff --check` — passed.
- `npx vue-tsc --noEmit -p tsconfig.app.json --skipLibCheck false` — failed only on Supabase dependency declarations referencing `NodeJS` and `Buffer`; the app config keeps `skipLibCheck` enabled while project source remains typechecked.
- `npm audit --omit=dev` — reported two high findings in the pre-existing Vue 3.5.22 / `@vue/server-renderer` dependency tree; not changed in this ticket.

No unit/e2e or browser OAuth flow was run. The Supabase GitHub provider is disabled, credentials and redirect configuration have not been entered, no isolated Supabase test project exists, and no Vercel environment or deployment changes were made. Do not mark the whole ticket accepted until the required owner setup and a permitted runtime validation are complete.

## Disposition

The code portion is clear to proceed. The ticket remains `blocked` on Owner configuration of the GitHub OAuth app/provider and redirect allow list, website environment configuration, and the remaining runtime acceptance. No Production login test was performed.
