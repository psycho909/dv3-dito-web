# 01 專案骨架與驗證管線

- Status: blocked
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
- 委派模型：Kiro 環境只有 `gpt-5.6-luna`，以 effort medium（施工、審查）／low（QA）執行；與 README 角色表 GPT-6 Luna 不同，屬環境限制。
- 2026-10-08 Owner 指示暫停並 commit 目前進度；工作流已中止。`package-lock.json` 為離線產生、可能不完整，**未 commit**，待 registry 可用後由 `npm install` 重新產生再提交。

## Dependencies and Blockers

- Blocked by：無 Ticket 阻擋。
- 環境阻塞：Kiro 工具終端無法取得 npm registry 回應（`npm ping`／`npm view` 無輸出，原因未確認）。解除條件：在可連 registry 的終端完成 `npm install`、`npx playwright install chromium` 與五項驗證。
- 接續快照：`.scratch/20261008-01-scaffold-pipeline/handoff.md`。

## Evidence

- Verification: 未完成。已嘗試 `npm install --package-lock-only --ignore-scripts --loglevel verbose`，雖然產生 `package-lock.json`，但 npm registry 查詢／安裝程序以 exit code -1 結束，未安裝 `node_modules`。因此 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build`、`npm run e2e` 均未通過；其中 `lint` 的可見錯誤為 `'eslint' 不是內部或外部命令`，其餘命令同樣因依賴未安裝而無法啟動。`npx playwright install chromium` 尚未執行。
- Review / Audit: 未執行；本次為 L1 骨架施工，且依賴安裝阻塞完整驗收。
- Commit / PR: 骨架檔案（不含 lockfile）以 WIP commit 保存進度；驗證尚未通過，不代表 Acceptance 完成。
- Dependency versions configured (registry query failed): `vite` 7.1.7、`vue` 3.5.22、`typescript` 5.9.3、`pinia` 3.0.3、`sass` 1.93.2、`vitest` 3.2.4、`@vue/test-utils` 2.4.6、`jsdom` 27.0.0、`@playwright/test` 1.55.0、`vue-tsc` 3.1.1、`@vitejs/plugin-vue` 6.0.1、`@eslint/js` 9.37.0、`eslint` 9.37.0、`eslint-plugin-vue` 10.5.0、`typescript-eslint` 8.46.0。
- Residual risk: 版本已寫入 `package.json`／`package-lock.json`，但尚未由當次 npm registry 查詢確認；五項驗證、Chromium 安裝與實際 e2e 結果待 npm registry 可用後重新執行。
