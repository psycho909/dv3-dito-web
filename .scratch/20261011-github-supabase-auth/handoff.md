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

Provide GitHub OAuth login/logout through the selected Supabase project while preserving local game-record behavior. PR #1 is merged and the Production page now shows the GitHub login entry. OAuth runtime acceptance remains pending because no isolated validation environment is available.

## Completed

- Added optional Supabase browser client, GitHub login/session/logout panel, exact-project CSP origin, `.env.example`, and setup documentation.
- The login UI states that game records remain local; no Supabase schema, records, or sync paths were added.
- Fixed sign-out messaging for local-session removal after remote revocation failure; invalid optional client configuration falls back to local-only play.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` passed.
- Independent L3 audit found no remaining code-scope blocker; report: [audit report](../../reports/audit/20261011-github-supabase-auth.md).
- Vercel automatically built a `READY` Preview for this branch. [Preview](https://dv3-dito-m3koamr4y-psycho909s-projects.vercel.app/) loads and displays the expected unconfigured-auth/local-only state; Production remains on `main` SHA `07706762d87eb1c9055f066faf3e24e72c513cb1`.
- After Owner approval on 2026-10-11, the GitHub Provider is enabled in Supabase; Site URL and the exact production redirect are `https://dv3-dito-web.vercel.app`. Vercel has `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` targeting Production only. Values and Client Secret were not recorded.
- PR [#1](https://github.com/psycho909/dv3-dito-web/pull/1) was squash-merged. Vercel Production is `READY` for commit `685421c5d5f3a18a2dafa6cfd4d4e55ae02f9081`; `https://dv3-dito-web.vercel.app/` loads and visibly renders the GitHub sign-in button and local-only record notice.

## Remaining

- OAuth login, reload/session, and logout have not been exercised. No isolated Supabase test project exists; do not create Production test users or data under D2.
- Owner can perform the first real login at the Production URL if desired; this creates a normal Production Auth user record. Until then, runtime OAuth remains unverified and this handoff stays blocked.

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
- Not run: unit/e2e tests or browser OAuth. Production Provider, URL configuration, Vercel environment settings, and READY Production deployment are verified above.
- `npm audit --omit=dev` reports two high findings in the pre-existing Vue 3.5.22 / `@vue/server-renderer` tree; this ticket did not change Vue.

## Blockers

- Production Provider, Supabase Auth URL configuration, and Vercel Production environment variables are set and verified.
- No isolated Supabase test project is available; Production OAuth account creation was not tested and remains prohibited by D2.
- OAuth runtime flow is not verified; a real user login or an isolated non-production Supabase project is needed to complete acceptance.

## Next Action

Owner may test GitHub login, page reload/session persistence, and logout at `https://dv3-dito-web.vercel.app/` with a real account. This creates a normal Production Auth user record; do not use a test account or write test data. Otherwise provide an isolated non-production Supabase project. Do not send the Client Secret in chat.
