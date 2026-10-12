# 登入後自動啟用雲端備份

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-12 Owner 於 Session 指示「先做登入後自動備份」，採納 Claude Code 建議：登入後自動啟用、維持每次操作同步、雙方皆有且不同時仍需確認。同日授權 review 通過即部署。
- Risk: L2（改變資料上雲時機；涉及正式 Supabase 寫入與帳號資料隔離）
- Updated: 2026-10-12
- Branch: main
- Git / Remote authority: 依 README；不開 PR；Claude Code 驗收後推送 main 觸發 Vercel 自動部署。不修改 Supabase migration／RPC。

## Goal

玩家登入 GitHub 後不需再按「啟用 GitHub 雲端備份」與確認，牌局即自動備份；不得因自動化而覆蓋任何一端的紀錄或跨帳號寫入。

## Scope

- `forgeStore` 在取得登入身分（`setCloudUser`）且本機尚未綁定雲端帳號（無 `cloudAccountId`）時，自動讀取雲端並依下表處理；本機記牌狀態由未初始化變成已開始時也要觸發同一流程。

  | 本機 | 雲端 | 行為 |
  |---|---|---|
  | 已開始記牌 | 無紀錄 | 自動上傳（沿用首次備份批次 `IMPORT_OVERWRITE`），之後每次操作同步 |
  | 未開始 | 有紀錄（未刪除） | 自動下載並綁定 |
  | 已開始 | 有紀錄（含墓碑） | 不自動處理，進入既有衝突流程（先匯出、再選版） |
  | 未開始 | 無紀錄或墓碑 | 綁定帳號但不上傳；開始記牌後的第一個操作即上傳 |

- 自動流程期間若本機紀錄變更、登入身分改變或 epoch 變化，放棄本次自動處理並重新評估，不得覆蓋（沿用既有 `cloudEpoch`、`game.value !== base` 防護）。
- 已綁定帳號 A、登入帳號 B：維持既有行為（停止並提示登入原帳號），不得自動改綁或上傳到 B。
- 移除或改造「啟用 GitHub 雲端備份」與上傳確認對話框，避免與自動流程重複；保留雲端衝突、刪除、重試等既有功能。
- 登入區顯示「登入後，牌局會自動備份到你的 GitHub 帳號雲端空間」；備份狀態元件持續顯示已備份／待送／離線／衝突。
- 升版 1.6.0：`package.json`、`package-lock.json`、`CHANGELOG.md`（Changed）。
- 更新 `docs/開發規格.md`、`docs/UIUX Design.md`、README 中「需玩家確認才上傳」的敘述。
- 單元測試覆蓋上表四種情況、流程中本機變更、帳號切換、離線（離線時排隊、連線後送出）；更新 `tests/e2e/github-cloud-backup.spec.ts`（mocked API）涵蓋自動上傳、第二裝置自動下載、衝突不覆蓋。

## Out of Scope

- 改為每局才備份（Owner 已採納維持每次操作同步）。
- 抽牌公平性分析與引擎權重（另開 Ticket）。
- Supabase schema／RPC／RLS 變更。

## Acceptance

- [x] 登入且本機已有紀錄、雲端無紀錄：不需任何點擊即上傳，狀態顯示已備份。
- [x] 新裝置登入且雲端有紀錄：自動下載並可接續記牌。
- [x] 兩端皆有紀錄：不覆蓋任何一端，進入衝突流程。
- [x] 帳號切換、流程中變更、離線情境皆不遺失或跨帳號寫入資料，有測試證明。
- [x] 登入區有自動備份說明；頁尾版本為 v1.6.0，版本紀錄含 1.6.0。
- [x] `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`npx playwright test` 全部通過。

## Constraints and Decisions

- 同步粒度維持「每次操作一批」，不改 RPC 契約。
- 正式網站驗證不建立正式合成資料；正式寫入由 Owner 以自身帳號實測（可選）。

## Dependencies and Blockers

- 無。

\r\n\r\n

## Evidence

- Verification: lint exit 0；typecheck exit 0；npm test 17 files／218 tests passed；build 129 modules；Playwright 122 tests passed（mobile／desktop）。
- Review / Audit: Standards 與規格 review 各 1 項；已修正 README 自動備份文案及 A→B 帳號綁定測試斷言。
- Commit / PR: 未提交、未推送（依 Ticket 指示）。
- Claude Code 驗收（2026-10-12）: PASS。審查 `forgeStore` 全部雲端寫入路徑：首次批次 expectedRevision 由實際讀取或 0 決定，伺服器 RPC 版本比對阻擋覆蓋；本機有紀錄＋雲端任何列（含墓碑）一律進衝突；墓碑復原僅在本機未開始記牌、首次操作時發生（新資料，非舊裝置回灌）；離線綁定以 revision 0 排隊，遇雲端既有資料回 VERSION_CONFLICT；帳號 A 綁定時 B 登入不改綁不寫入；await 後皆檢查 epoch／userId／base。UI 移除啟用與上傳確認，保留重試、衝突、刪除。獨立重跑 lint 0 error、typecheck 0 error、unit 218/218、e2e 122/122。
- Commit / PR（Claude Code）: 依 README Git 授權 commit／push 至 `main`，觸發 Vercel Production 自動部署（Owner 授權 review 通過即部署）。
- Deployment: 2026-10-12 `59aff27` Vercel 部署 success；正式網站 Chromium 375px／1280px 未登入驗證：頁尾 v1.6.0、顯示自動備份說明、無「啟用 GitHub 雲端備份」按鈕、記牌與建議正常、無溢出與頁面錯誤、安全標頭存在。未在正式網站登入（不建立正式合成資料）。
