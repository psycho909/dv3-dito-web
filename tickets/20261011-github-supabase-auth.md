# Supabase GitHub 登入

- Status: blocked
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-11 Owner 明確要求「下一步與網站串接起來，使用github登入方式」；另確認啟用正式 Supabase GitHub Provider、設定正式 Site URL／redirect allow list／Vercel Production 公開環境變數，並明確授權本分支經 PR 合併到 `main` 及觸發 Production 部署（已知 OAuth runtime 尚未驗證、首次真實登入會建立正式 Auth 使用者）。
- Risk: L3
- Updated: 2026-10-11
- Branch: codex/github-supabase-auth
- Git / Remote authority: 依 README；Owner 於 2026-10-11 另行授權正式 Auth 設定及本分支經 PR／merge 發布至 Production。

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
- Owner 於 2026-10-11 另行授權的 PR／merge／Production 部署已納入本票執行範圍。
- 對正式 Supabase 建立測試帳號或寫入測試資料。

## Acceptance

- [x] 未設定或無效 Supabase 環境變數時明示登入未設定，既有本機記牌仍可使用（程式碼與獨立 Audit 確認；未做瀏覽器 runtime 測試）。
- [ ] 設定完成時可開始 GitHub OAuth、重整後顯示 SDK session，並可登出。
- [x] OAuth 或登出失敗提供可理解訊息；介面明示登入不會同步記牌資料（程式碼與 SDK 行為經獨立 Audit 確認）。
- [x] CSP 僅放行指定 Supabase API；前端只使用 publishable key（程式碼與設定經獨立 Audit 確認）。
- [x] Owner 設定並啟用正式 GitHub Provider、正式 redirect allow list 與 Vercel Production 環境變數（2026-10-11；不含部署）。
- [ ] 以隔離的非正式驗證環境完成 OAuth 登入／重整 session／登出流程；不在正式資料庫建立測試資料。

## Constraints and Decisions

- GitHub OAuth 帳號登入是本票選定的登入入口；記牌功能仍為本機優先。此票不改寫 S2 的雲端備份與匿名帳號規格。
- Supabase 正式專案 ref：`lcsyotvievikernvhquj`；GitHub callback：`https://lcsyotvievikernvhquj.supabase.co/auth/v1/callback`。
- GitHub Client Secret 僅由 Owner 在 Supabase Dashboard 輸入；不得回傳給 Agent。

## Dependencies and Blockers

- Supabase Dashboard 的 GitHub Provider 已啟用；Owner 已直接在 Dashboard 設定 OAuth Client ID／Secret，Secret 未讀取或傳出。
- Supabase Site URL 與 redirect allow list 已設為 `https://dv3-dito-web.vercel.app`；Vercel `dv3-dito-web` 的 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_PUBLISHABLE_KEY` 僅設在 Production。
- 目前沒有隔離 Supabase 測試專案；正式 OAuth 測試帳號受 D2「測試資料不寫入正式專案」限制。Owner 已授權 PR／merge／Production 部署，發布後仍需隔離驗證環境才能完成 OAuth runtime acceptance。

## Evidence

- Verification: 2026-10-11 `npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 均通過。另確認 `npx vue-tsc --noEmit -p tsconfig.app.json --skipLibCheck false` 會因 Supabase 上游 `.d.ts` 缺少 `NodeJS`／`Buffer` 型別而失敗；`skipLibCheck` 保留應用程式型別檢查並避開第三方宣告錯誤。未執行 unit／e2e 或 Auth runtime 流程。
- Review / Audit: 2026-10-11 獨立 Auditor（gpt-6-luna Max，未參與施工）檢查完整 staged／unstaged／新增檔案及鎖定版 SDK；確認本機資料隔離、publishable key 與 CSP 邊界、登入／登出錯誤處理，無程式碼阻擋 finding。修正登出訊息和無效設定 fallback 後增量複查，無新 blocker。報告：[20261011-github-supabase-auth](../reports/audit/20261011-github-supabase-auth.md)。
- Remaining evidence: OAuth runtime 登入／session／登出尚未驗證；沒有隔離 Supabase 測試專案，且 D2 禁止在 Production 建立測試使用者。Owner 已授權本分支 PR／merge／Production 部署。
- Hosted Preview: `codex/github-supabase-auth` 的 Vercel Preview 已自動完成並為 Ready；頁面顯示登入未設定或無效，並保留本機記牌提示。Preview origin：`https://dv3-dito-web-git-codex-github-supabase-auth-psycho909s-projects.vercel.app`。Production 目前仍部署 `main` 的 `07706762d87eb1c9055f066faf3e24e72c513cb1`。
- Production Auth configuration: 2026-10-11 Owner 授權後，Supabase GitHub Provider 為 enabled；重新載入 Dashboard 確認 Site URL 和 allow-list redirect 均為 `https://dv3-dito-web.vercel.app`。Vercel env 清單確認兩個變數都 target `production`，沒有新增 Preview／Development 變數。未讀取或記錄 Client Secret／環境變數值。
- Production deployment check: Vercel 最新 Production deployment 為 `READY`，仍使用 `main` SHA `07706762d87eb1c9055f066faf3e24e72c513cb1`；本票功能程式碼尚未發布。
- Dependency audit: `npm audit --omit=dev` 回報既有 Vue 3.5.22／`@vue/server-renderer` 兩項 high advisory；本票未升級此無關依賴。
- Commit / PR: 本票、稽核報告與 handoff 納入 `codex/github-supabase-auth` 分支提交；未建立 PR。
