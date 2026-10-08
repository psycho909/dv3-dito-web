# 01 專案骨架與驗證管線

- Status: approved
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」；Scope 依 `docs/開發規格.md` v1.5 §3
- Risk: L1
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

建立可執行的專案骨架，讓後續每張 Ticket 都有同一套驗證命令。

## Scope

- Vite + Vue 3 + TypeScript + Pinia + SCSS + Vitest + Playwright；套件版本鎖定、lockfile 入庫。
- `lint`、`typecheck`、`test`、`build`、`e2e` 腳本，各有一個最小通過範例。
- 鍛造台色彩 token（`docs/UIUX Design.md` §8）建立於 `tokens.scss`。
- README：目的、快速開始、驗證入口表填寫實際命令。

## Out of Scope

- 任何 domain 邏輯與正式 UI 元件。

## Acceptance

- [ ] 乾淨 clone 後依 README 安裝，五個驗證命令全部通過。
- [ ] `package.json` 無 `^`／`~` 版本範圍，lockfile 已提交。
- [ ] README 驗證表沒有空白欄位。

## Constraints and Decisions

- 只引入規格 §3 列出的依賴；不加入 Supabase SDK。

## Dependencies and Blockers

- Blocked by：無。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
