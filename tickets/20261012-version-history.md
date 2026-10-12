# 版本號與網站內版本紀錄

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-12 Owner 於 Session 要求「希望加上版本紀錄，才知道每次的更新內容」；同日授權 review 通過即部署（推送 main 即 Vercel Production）。
- Risk: L1（新增唯讀 UI 與文件流程；不改記牌資料、雲端契約或推薦）
- Updated: 2026-10-12
- Branch: main
- Git / Remote authority: 依 README；不開 PR；Claude Code 驗收後推送 main 觸發 Vercel 自動部署。

## Goal

玩家在網站上能看到目前版本，並查看每次更新的內容；`CHANGELOG.md` 是唯一來源，之後每次使用者可見的部署都有對應版本。

## Scope

- 版本採 SemVer；`package.json` 的 `version` 是目前版本的唯一來源（建置時注入，例如 Vite `define` 或 `import.meta.env`），`package-lock.json` 同步。
- 依 git 歷史與 `tickets/` 回溯整理已上線版本，改寫 `CHANGELOG.md`（保留 Keep a Changelog 格式：`## [x.y.z] - YYYY-MM-DD`，其下 `### Added／Changed／Fixed`），把目前 `[Unreleased]` 內容分配到各版。預設切法（施工者可依證據微調，需在 Ticket 記錄理由）：
  - 1.0.0 - 2026-10-11：本機版首次上線（Ticket 01～12、D1：記牌、機率、撤銷、補滿週期、本機保存、本局推薦、明細、核對、歷史修正、備份匯入、視覺無障礙）。
  - 1.1.0 - 2026-10-11：GitHub 登入（`685421c`）。
  - 1.2.0 - 2026-10-12：GitHub 雲端備份、衝突處理與安全刪除（`ff86f96`）。
  - 1.2.1 - 2026-10-12：補滿門檻改為剩 15 顆以下（`26d4c59`）。
  - 1.3.0 - 2026-10-12：顯示各等級得分（`15664d6`）。
  - 1.4.0 - 2026-10-12：推薦改為最大化期望得分（`b645c6f`）。
  - 1.5.0 - 2026-10-12：本次版本紀錄功能。
  條目以玩家看得懂的繁體中文描述，移除對玩家無意義的內部細節（例如「後端已準備，網站尚未啟用」這類過渡說明應整併到正確版本）。`[Unreleased]` 保留為空區段。
- 網站頁尾顯示「v<版本>」與「版本紀錄」按鈕；開啟對話框（沿用專案既有 dialog／drawer 的無障礙模式：焦點移入、Esc 關閉、焦點返回、背景 inert）列出各版本、日期與分類條目，最新在上。
- 內容在建置時由 `CHANGELOG.md` 產生（例如 `?raw` 匯入加最小解析器，只支援上述固定格式；未知格式在建置或單元測試時失敗，不在執行期靜默）。不新增依賴、不從網路載入、不使用 `v-html`。
- 流程文件：在 README（驗證／部署段落）與 `docs/DEPLOYMENT.md` 加入規則——每次含使用者可見變更推送 main 前，必須升 `package.json` 版本並在 `CHANGELOG.md` 新增同版本與日期區段；純文件／測試推送不升版。
- 單元測試：解析器（正常、空 Unreleased、格式錯誤）、版本與 CHANGELOG 最新版本一致的檢查；e2e：手機 375px 與桌機開啟／關閉版本紀錄、無水平溢出、鍵盤操作。

## Out of Scope

- 自動從 commit 產生 changelog、git tag／GitHub Release、版本更新通知彈窗。
- 記牌資料、備份或雲端格式中加入版本欄位。

## Acceptance

- [x] 頁尾顯示 `v1.5.0`，與 `package.json` 一致。
- [x] 版本紀錄對話框列出 1.0.0～1.5.0 各版本、日期與條目，最新在上；內容來自 `CHANGELOG.md`。
- [x] 有測試保證 `package.json` 版本等於 `CHANGELOG.md` 最新已發布版本；格式錯誤會讓測試失敗。
- [x] 對話框鍵盤可操作、Esc 關閉、焦點返回；375px 無水平溢出。
- [x] README 與 `docs/DEPLOYMENT.md` 記錄升版規則。
- [x] `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`npx playwright test` 全部通過。

## Constraints and Decisions

- 回溯版本號由 Claude Code 依 git 歷史提出（Owner 未指定版本策略；SemVer 為可逆預設）。
- 採用本 Ticket 的預設切法，未調整：1.0.0 對應 2026-10-11 首次本機版及 Ticket 01～12／D1；1.1.0／1.2.0／1.2.1／1.3.0／1.4.0 分別對應 `685421c`／`ff86f96`／`26d4c59`／`15664d6`／`b645c6f`，git 日期與變更內容均符合版本摘要；1.5.0 為本次版本紀錄功能。
- `CHANGELOG.md` 是唯一內容來源，網站不得另存第二份版本紀錄。

## Dependencies and Blockers

- 無。

## Evidence

- Verification: 工作目錄 `D:\\Codex\\dv3-dito-web`，Node 24.19.0／npm 11.9.0。`npm.cmd run lint` 通過（0 errors、0 warnings）；`npm.cmd run typecheck` 通過（app 與 node 設定皆無錯誤）；`npm.cmd test` 通過（17 個測試檔、209 tests）；`npm.cmd run build` 通過（129 modules transformed）；`npx.cmd playwright test --reporter=dot` 通過（122 passed，mobile 與 desktop 專案全數通過）。`git diff --check` 通過，無 whitespace errors。
- Review / Audit: 以 HEAD `4448877` 為基準；檢查 `git diff -- CHANGELOG.md README.md docs/DEPLOYMENT.md package.json package-lock.json src/App.vue vite.config.ts vitest.config.ts`，並逐一讀取 `git ls-files --others --exclude-standard` 列出的新增檔案；`git diff --cached --name-only` 為空。完成 L1 primary self-review，對照根 `AGENTS.md`、本 Ticket、`docs/development/ai-development-guide.md`、`docs/agents/skill-workflows.md` 與 `docs/agents/review.md`；確認無新增依賴、無網路讀取、無 `v-html`，版本格式與 package/changelog 一致，功能未改動備份資料格式。未執行獨立稽核。
- Skills: `matt-skills-curated:implement` 1.1.0；`matt-skills-curated:tdd` 1.1.0。
- Review / Audit（驗收）: Claude Code 2026-10-12 PASS：審查版本注入（vite define + 建置時比對 package.json 與 CHANGELOG 最新版）、解析器（固定格式、錯誤即失敗、Unreleased 必須為空、SemVer 遞減）、對話框無障礙與頁尾；將 1.4.0 推薦改版由「新增」改歸「調整」；獨立重跑 lint 0 error、typecheck 0 error、unit 209/209、e2e 122/122，375px 截圖確認版本紀錄可讀無溢出。
- Commit / PR: Claude Code（施工：Codex）依 README Git 授權 commit／push 至 `main`，觸發 Vercel Production 自動部署（Owner 2026-10-12 授權 review 通過即部署）；無 PR。
- Deployment: 2026-10-12 `156f3f5` Vercel 部署 success；正式網站 Chromium 375px／1280px 未登入驗證：頁尾 `v1.5.0`，版本紀錄列出 v1.5.0～v1.0.0，Esc 關閉，無水平溢出、無頁面錯誤；CSP／nosniff／Referrer-Policy 標頭存在。
