# D1 Vercel 部署本機版

- Status: draft
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 確認「網頁會在 Vercel 部屬」（部署平台決策）；實際部署執行需另行授權
- Risk: L2
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；部署到 Vercel 需 Owner 在執行當下明確授權

## Goal

把本機版 V1 以靜態 SPA 部署到 Vercel，玩家可用網址開啟並在手機上使用。

## Scope

- Vercel 專案設定（Framework Vite、build 指令、輸出目錄）；SPA 路由 fallback 設定（若使用 history mode）。
- Preview 部署驗證後再 Production。
- 安全標頭（CSP、`X-Content-Type-Options`、`Referrer-Policy`）的最小設定。
- 確認 `docs/references/` 截圖不在部署產物內。
- README：部署方式與網址。

## Out of Scope

- Supabase 環境變數（D2）、自訂網域（需另行決定）。

## Acceptance

- [ ] Preview 網址在手機與桌機完成一次 4/7/6 跨局流程。
- [ ] 部署產物不含 `docs/references/` 與任何密鑰。
- [ ] Production 網址可開啟，README 已記錄。

## Constraints and Decisions

- 部署平台：Vercel（Owner 決定）。
- 需要 Owner 提供或建立 Vercel 帳號／專案並連結 GitHub repo。

## Dependencies and Blockers

- Blocked by：12。
- Owner 的 Vercel 帳號與 repo 連結權限。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
