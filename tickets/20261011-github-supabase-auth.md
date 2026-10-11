# Supabase GitHub 登入

- Status: blocked
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-11 Owner 明確要求「下一步與網站串接起來，使用github登入方式」；核准範圍為網站 GitHub OAuth 登入，不含雲端記牌資料。
- Risk: L3
- Updated: 2026-10-11
- Branch: codex/github-supabase-auth
- Git / Remote authority: 依 README；本票不含正式環境設定與 Production 發布。

## Goal

讓網站可透過正式 Supabase 專案的 GitHub OAuth 登入與登出，並保留未登入時的本機記牌能力。

## Scope

- 鎖定 `@supabase/supabase-js`，以 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_PUBLISHABLE_KEY` 初始化瀏覽器 client。
- 新增 GitHub OAuth 登入、session 狀態與登出介面；Auth SDK 管理 session。
- CSP 僅允許連線到指定 Supabase 專案 API。
- 更新本機設定說明與 GitHub OAuth callback 指引。

## Out of Scope

- 記牌資料上雲、匿名登入／Email 恢復、資料表、RLS、RPC、migration 與跨裝置同步（S1～S5）。
- 在程式碼、Vercel 或聊天中保存／傳遞 GitHub Client Secret。
- Production Provider 設定、Vercel 環境變數或正式部署；須待 Owner 完成 OAuth 憑證設定及必要的 action-time 安全確認。
- 對正式 Supabase 建立測試帳號或寫入測試資料。

## Acceptance

- [x] 未設定或無效 Supabase 環境變數時明示登入未設定，既有本機記牌仍可使用（程式碼與獨立 Audit 確認；未做瀏覽器 runtime 測試）。
- [ ] 設定完成時可開始 GitHub OAuth、重整後顯示 SDK session，並可登出。
- [x] OAuth 或登出失敗提供可理解訊息；介面明示登入不會同步記牌資料（程式碼與 SDK 行為經獨立 Audit 確認）。
- [x] CSP 僅放行指定 Supabase API；前端只使用 publishable key（程式碼與設定經獨立 Audit 確認）。
- [ ] Owner 設定 Provider、redirect allow list 與網站環境變數後，以可用的非正式驗證環境完成登入／登出流程；不在正式資料庫建立測試資料。

## Constraints and Decisions

- GitHub OAuth 帳號登入是本票選定的登入入口；記牌功能仍為本機優先。此票不改寫 S2 的雲端備份與匿名帳號規格。
- Supabase 正式專案 ref：`lcsyotvievikernvhquj`；GitHub callback：`https://lcsyotvievikernvhquj.supabase.co/auth/v1/callback`。
- GitHub Client Secret 僅由 Owner 在 Supabase Dashboard 輸入；不得回傳給 Agent。

## Dependencies and Blockers

- Supabase Dashboard 的 GitHub Provider 目前關閉；需 Owner 建立 GitHub OAuth App，並將 Client ID／Secret 輸入 Provider 設定後啟用。
- Supabase Auth URL Configuration 需加入正式網站與本機 redirect URL；Vercel Preview 規則依實際測試網址設定。
- 目前沒有隔離 Supabase 測試專案；Production OAuth 建帳測試受 D2「測試資料不寫入正式專案」限制。

## Evidence

- Verification: 2026-10-11 `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 均通過。另確認 `npx vue-tsc --noEmit -p tsconfig.app.json --skipLibCheck false` 會因 Supabase 上游 `.d.ts` 缺少 `NodeJS`／`Buffer` 型別而失敗；`skipLibCheck` 保留應用程式型別檢查並避開第三方宣告錯誤。未執行 unit／e2e 或 Auth runtime 流程。
- Review / Audit: 2026-10-11 獨立 Auditor（gpt-6-luna Max，未參與施工）檢查完整 staged／unstaged／新增檔案及鎖定版 SDK；確認本機資料隔離、publishable key 與 CSP 邊界、登入／登出錯誤處理，無程式碼阻擋 finding。修正登出訊息和無效設定 fallback 後增量複查，無新 blocker。報告：[20261011-github-supabase-auth](../reports/audit/20261011-github-supabase-auth.md)。
- Remaining evidence: Provider 仍停用，OAuth 憑證、redirect allow list、Vercel 環境變數與登入流程尚未設定／測試；沒有隔離 Supabase 測試專案，正式 OAuth 建帳驗證仍受 D2 限制。
- Hosted Preview: `codex/github-supabase-auth` 的 Vercel Preview 已自動完成並為 Ready；頁面顯示登入未設定或無效，並保留本機記牌提示。Preview origin：`https://dv3-dito-web-git-codex-github-supabase-auth-psycho909s-projects.vercel.app`。Production 目前仍部署 `main` 的 `07706762d87eb1c9055f066faf3e24e72c513cb1`。
- Dependency audit: `npm audit --omit=dev` 回報既有 Vue 3.5.22／`@vue/server-renderer` 兩項 high advisory；本票未升級此無關依賴。
- Commit / PR: 本票、稽核報告與 handoff 納入 `codex/github-supabase-auth` 分支提交；未建立 PR。
