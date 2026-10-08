# D2 Vercel 部署雲端版

- Status: draft
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 未取得；部署平台已由 Owner 決定為 Vercel
- Risk: L3
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；設定 Vercel 環境變數與 Production 部署需 Owner 在執行當下明確授權

## Goal

讓 Vercel 上的網站連到正式 Supabase 專案，玩家可以使用雲端備份與跨裝置恢復。

## Scope

- Vercel Preview／Production 環境變數：`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、Turnstile site key（分環境設定）。
- Supabase Auth 的 Site URL 與 Redirect URLs 加入 Vercel 網域（含 Preview 網域規則）。
- CSP 加入 Supabase 與 Turnstile 網域。
- 正式 Supabase 專案套用 S1 migration。
- README：環境設定、配額與服務不可用時的行為。

## Out of Scope

- 自訂網域、付費方案升級。

## Acceptance

- [ ] Preview 環境完成：匿名備份、斷線重送、Email 連結、跨裝置恢復、衝突、刪除各一次。
- [ ] 前端 bundle 不含 `service_role` 或資料庫密碼（以搜尋 build 產物驗證）。
- [ ] Production 部署後，未設定雲端時仍能本機使用。

## Constraints and Decisions

- 測試資料不寫入正式 Supabase 專案。

## Dependencies and Blockers

- Blocked by：D1、S3、S4、S5。
- 需要 Owner 提供正式 Supabase 專案與 Vercel 環境變數設定權限。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
