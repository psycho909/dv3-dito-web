# 01 專案骨架與驗證管線

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」；本次於 Codex 雲端環境要求「直接進行開發」，接續同一 Scope。
- Risk: L1
- Updated: 2026-10-08
- Branch: work
- Git / Remote authority: 依 README；commit／push 目前工作分支，不含 PR、部署。

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

- [x] 乾淨 clone 後依 README 安裝，五個驗證命令全部通過。
- [x] `package.json` 無 `^`／`~` 版本範圍，lockfile 更新納入本次交付 commit。
- [x] README 驗證表沒有空白欄位。

## Constraints and Decisions

- 不加入 Supabase SDK。補齊既有工具鏈所需的 `@types/node` 22.14.0 與 `vue-eslint-parser` 10.4.1，均鎖定版本。
- ESLint 保留 Vue SFC parser、內層使用 TypeScript parser；`.scratch` 研究原型不屬正式應用程式 lint 範圍。
- Typecheck 明確檢查 app 與 node tsconfig；原本根 tsconfig 無 files，單獨執行不會檢查 app。
- Vitest 限定 unit tests；Playwright 的 mobile／desktop 皆使用 Chromium，手機 viewport 為 375×812。
- 先前 Kiro 終端 registry 阻塞及離線 lockfile 疑慮已由雲端 `npm ci` 實際安裝、checksum 驗證解除；已追蹤的 lockfile 沿用並由 npm 正常更新。
- Owner 本次要求不同工作類型指派 sub-agent；實際入口與模型須先核對，不以角色名稱推測 runtime 身份。

## Dependencies and Blockers

- 無 Ticket 阻擋。
- Chromium 已由官方 Playwright CDN 下載成功。
- 雲端系統 WOFF2 字型導致鎖定版 Chromium heading 高度為 0；環境 helper `/workspace/shared/dv3-dito-fonts.conf` 排除 WOFF2 後高度為 46px，e2e 通過。README 保存使用方式。

## Evidence

- Verification: `g6-luna-low-qa-runner`（spawn 明確指定 `gpt-6-luna`／low）在 `/tmp/dv3-scaffold-qa.qUQyHf/repo` 建立乾淨本機 clone、套用 tracked diff；Node 24.19.0／npm 11.9.0，`npm ci --no-audit --no-fund` 安裝 325 packages。`npm run lint`、`npm run typecheck`、`npm run test`（1/1）、`npm run build`、`CI=1 npm run e2e -- --reporter=list`（desktop／375px mobile 2/2）全部 exit 0。lockfile 安裝前後 SHA-256 同為 `02c2a14cea07474ab3d1ccebdc6639f2ecc751be680690ead6b18649b9acb3bd`。雲端 env 見 README；未宣稱測過 Node 22.14.0／npm 11.11.1。
- Review / Audit: 使用 `matt-skills-curated:implement` 與 `matt-skills-curated:code-review`；獨立 `g6-luna-med-reviewer`（spawn 明確指定 `gpt-6-luna`／medium，agent 無獨立 runtime metadata 可核實）審查全部 9 個 tracked 變更、`git diff --`、`git diff --cached --`、新檔列表及外部字型 helper。基準 `7b3569de5e3df7de8d70ede9417d444fa651b7ae`。Standards 無 finding；Spec 曾指出 commit 尚未完成卻記為已提交，已修正並由 reviewer 確認解除。本次 commit 一併保存最終 Acceptance／證據。平台 spawn 入口無名稱參數，UI 自動 nickname 無法改名；契約及記錄均使用 README 固定角色名稱。
- Commit / PR: 本次 `fix: complete scaffold verification pipeline` commit 保存於 work；遠端同步另由 Git 結果核對，未建立 PR、未部署。
- Residual risk: npm 回報既有 glob、ESLint、whatwg-encoding 棄用提示；不在本張 Ticket 升級工具鏈。一般 clone 需具備正常系統字型、Chromium runtime dependencies 及 CDN 網路存取。
