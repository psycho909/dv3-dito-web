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

Provide GitHub OAuth login/logout through the selected Supabase project while preserving local game-record behavior. Code-level acceptance is reviewed and Production Auth settings are configured. Owner authorized PR, merge, and Production deployment on 2026-10-11; OAuth runtime acceptance remains pending an isolated validation environment.

## Completed

- Added optional Supabase browser client, GitHub login/session/logout panel, exact-project CSP origin, `.env.example`, and setup documentation.
- The login UI states that game records remain local; no Supabase schema, records, or sync paths were added.
- Fixed sign-out messaging for local-session removal after remote revocation failure; invalid optional client configuration falls back to local-only play.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` passed.
- Independent L3 audit found no remaining code-scope blocker; report: [audit report](../../reports/audit/20261011-github-supabase-auth.md).
- Vercel automatically built a `READY` Preview for this branch. [Preview](https://dv3-dito-m3koamr4y-psycho909s-projects.vercel.app/) loads and displays the expected unconfigured-auth/local-only state; Production remains on `main` SHA `07706762d87eb1c9055f066faf3e24e72c513cb1`.
- After Owner approval on 2026-10-11, the GitHub Provider is enabled in Supabase; Site URL and the exact production redirect are `https://dv3-dito-web.vercel.app`. Vercel has `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` targeting Production only. Values and Client Secret were not recorded.

## Remaining

- Production configuration is complete, but the feature code is not deployed; the latest Production deployment remains on `main` SHA `07706762d87eb1c9055f066faf3e24e72c513cb1`.
- Owner authorized PR, merge, and Production deployment after being informed OAuth runtime is untested. No isolated Supabase test project exists; do not create Production test data under D2.
- Complete OAuth login, reload/session, and logout validation in an isolated non-production environment once available; Production OAuth runtime remains unverified.
- Keep this handoff blocked until runtime acceptance is available and the deployment decision is recorded.

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
- Not run: unit/e2e tests, browser OAuth or Production deployment. Production Provider, URL configuration and Vercel environment settings are verified above.
- `npm audit --omit=dev` reports two high findings in the pre-existing Vue 3.5.22 / `@vue/server-renderer` tree; this ticket did not change Vue.

## Blockers

- Production Provider, Supabase Auth URL configuration, and Vercel Production environment variables are set and verified.
- No isolated Supabase test project is available; Production OAuth account creation was not tested and remains prohibited by D2.
- PR/merge and Production deployment are authorized; required checks and deployment verification remain.

## Next Action

Open a PR from this branch to `main`, confirm required checks, merge under the Owner authorization, and verify the Production deployment. Do not create Production test users; runtime OAuth validation still needs an isolated non-production Supabase project. Do not send the Client Secret in chat.
