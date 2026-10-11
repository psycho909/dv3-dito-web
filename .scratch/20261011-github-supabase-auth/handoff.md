# Task Handoff

## Identity
- Task: Supabase GitHub Login
- Authority / Ticket: [20261011-github-supabase-auth](../../tickets/20261011-github-supabase-auth.md)
- Status: blocked
- Updated: 2026-10-11
- Source environment: Windows local workspace `D:\Codex\dv3-dito-web`
- Branch: `codex/github-supabase-auth`
- Remote: `origin`
- Base commit: `07706762d87eb1c9055f066faf3e24e72c513cb1`
- Working tree: clean after this handoff commit; ignored `.env.local` remains local and is not included.
- Sync target: `origin/codex/github-supabase-auth`

## Goal and Acceptance

Provide GitHub OAuth login/logout through the selected Supabase project while preserving local game-record behavior. Code-level acceptance is reviewed; actual OAuth runtime acceptance is pending dashboard configuration and an allowed validation environment.

## Completed

- Added optional Supabase browser client, GitHub login/session/logout panel, exact-project CSP origin, `.env.example`, and setup documentation.
- The login UI states that game records remain local; no Supabase schema, records, or sync paths were added.
- Fixed sign-out messaging for local-session removal after remote revocation failure; invalid optional client configuration falls back to local-only play.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` passed.
- Independent L3 audit found no remaining code-scope blocker; report: [audit report](../../reports/audit/20261011-github-supabase-auth.md).
- Vercel automatically built a `READY` Preview for this branch. [Preview](https://dv3-dito-m3koamr4y-psycho909s-projects.vercel.app/) loads and displays the expected unconfigured-auth/local-only state; Production remains on `main` SHA `07706762d87eb1c9055f066faf3e24e72c513cb1`.

## Remaining

- Owner must create a GitHub OAuth App and enter its Client ID and Client Secret directly in Supabase Dashboard.
- Configure Supabase Auth Site URL and redirect allow list, then set the Vercel environment variables in the intended environment(s).
- If using this Preview for OAuth, add its origin to the redirect allow list: `https://dv3-dito-web-git-codex-github-supabase-auth-psycho909s-projects.vercel.app`.
- Complete the permitted OAuth login, reload/session, and logout validation. No isolated Supabase test project exists; do not create Production test data under D2.
- The task remains blocked until runtime acceptance evidence is available.

## Decisions

- Project: `dv3-dito-web`, Supabase ref `lcsyotvievikernvhquj`, Tokyo.
- GitHub callback: `https://lcsyotvievikernvhquj.supabase.co/auth/v1/callback`.
- This ticket adds authentication only. It does not change S1-S5 or make game records cloud-synced.
- `.env.local` is ignored and contains only the project URL and publishable key; no credentials or secret keys belong in Git or chat.

## Changed Files

- `.gitignore`, `.env.example`, `README.md`, `TODO.md`
- `package.json`, `package-lock.json`, `tsconfig.app.json`, `vercel.json`
- `src/App.vue`, `src/components/GitHubAuthPanel.vue`, `src/services/supabaseClient.ts`
- `tickets/20261011-github-supabase-auth.md`
- `reports/audit/20261011-github-supabase-auth.md`
- `.scratch/20261011-github-supabase-auth/handoff.md`

## Verification

- Passed: `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`.
- Not run: unit/e2e tests, browser OAuth, Production provider, Vercel configuration or deployment.
- `npm audit --omit=dev` reports two high findings in the pre-existing Vue 3.5.22 / `@vue/server-renderer` tree; this ticket did not change Vue.

## Blockers

- Supabase GitHub Provider is currently disabled and needs Owner-managed OAuth credentials.
- Auth URL configuration and Vercel environment variables remain pending.
- No isolated Supabase test project is available; Production OAuth account creation was not tested.

## Next Action

Owner creates the GitHub OAuth App using the callback above, then enters its Client ID and Client Secret directly in Supabase Authentication → Sign In / Providers → GitHub and enables the provider. Do not send the Client Secret in chat.
