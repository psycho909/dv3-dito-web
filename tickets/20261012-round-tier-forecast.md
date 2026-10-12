# 本局等級機率預估

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-12 Owner 於 Session 詢問開局前能否預估本局 GOOD／PERFECT 機率，同意 Claude Code 提案（開局前與局中顯示依建議操作的五級機率與期望得分），並指示「只要驗收完沒問題就部屬」。
- Risk: L2（推薦核心擴充與新增決策資訊顯示）
- Updated: 2026-10-12
- Branch: main
- Git / Remote authority: 依 README；不開 PR；Claude Code 驗收後推送 main 觸發 Vercel 自動部署。

## Goal

讓玩家在開局前與局中看到：若之後依建議操作，本局最終落在 PERFECT／GREAT／GOOD／NORMAL／BURST 的精確機率與期望得分。

## Scope

- `src/domain/recommendation.ts` 擴充：同一次 expectimax 求解中，依最佳策略（期望得分最大、平手停手、0 點必抽）傳遞最終等級機率分布；提供「從空手牌、給定牌池」與「從目前手牌」兩種查詢。沿用 memo、`maxStates`／`maxTimeMs` 上限與 `COMPUTATION_LIMIT` 行為。
- 局中：推薦區顯示依建議操作的本局五級機率與期望得分，每次輸入／撤銷後重算。
- 開局前（FINISHED 狀態）：「開始新局」附近顯示下一局預估；剩 15 顆以下（`REFILL_THRESHOLD`）時以滿 52 顆計算並標示「依補滿規則推定」。
- 顯示閘門與現行推薦一致：UNSYNCED、空牌池或計算超限時不顯示數字並說明原因；推定週期明示為推定。
- 文案明示「假設之後照建議操作」，不寫成保證或收益。
- 規格 FR-13 補充公式與案例；CHANGELOG 新增 1.7.0（`package.json`／lock 同步）。
- 測試：獨立 no-memo oracle 比對分布（1,000 組隨機小牌池、機率總和 1）；固定案例（以下數值由 Claude Code 獨立腳本算出，允許 ±0.05 個百分點）：
  - 滿 52 顆空手牌：期望 34.22；PERFECT 11.6%、GREAT 29.9%、GOOD 37.4%、NORMAL 0.0%、BURST 21.1%。
  - A～9 各 2、10 有 12：期望 34.41；11.0%／32.9%／33.8%／0.0%／22.3%。
  - A～9 各 3、10 有 3：期望 36.62；16.2%／36.4%／9.4%／0.0%／38.1%。
- e2e：開局前與局中顯示、375px 無溢出、UNSYNCED 隱藏。
- 效能基準 `node tests/benchmarks/recommendation.mjs` 仍 p95 < 50 ms、全新 52 顆不觸發計算上限。

## Out of Scope

- 不照建議操作時的機率、跨局（週期）最佳化、抽牌權重估計。
- 備份／雲端資料格式（預估不持久化）。

## Acceptance

- [x] 開局前顯示下一局五級機率與期望得分；剩 ≤15 時以 52 顆推定並標示。
- [x] 局中顯示依建議操作的本局五級機率與期望得分，輸入後即時更新。
- [x] 三個固定案例與 oracle 比對通過；分布總和為 1。
- [x] UNSYNCED／空牌池／計算超限不顯示數字；文案註明「依建議操作」。
- [x] 效能基準通過。
- [x] 頁尾 v1.7.0，版本紀錄含 1.7.0。
- [x] `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`npx playwright test` 全部通過。

## Constraints and Decisions

- 機率為精確枚舉，不使用 Monte Carlo；不需要歷史資料。
- 預估結果不寫入本機或雲端資料。

## Dependencies and Blockers

- 排在 `20261012-auto-cloud-backup` 驗收部署後施工（避免同時修改 store 與版本號）。

## Evidence

- 驗證：lint、typecheck exit 0；npm test 18 個檔案／226 項通過；build 132 modules 通過；Playwright 122 項通過；benchmark 每案例 100 次，p95 為 23.6／4.7／0.8／0.3 ms，computation limit 皆為 0。
- 固定案例（期望得分；PERFECT／GREAT／GOOD／NORMAL／BURST）：52 張空手牌為 34.2191503；11.5974%／29.8589%／37.4048%／0%／21.1390%。A–9 各 2 張、10 共 12 張為 34.4071571；10.9652%／32.9247%／33.7819%／0%／22.3283%。A–9 各 3 張、10 共 3 張為 36.6172799；16.1589%／36.4087%／9.3669%／0%／38.0655%。No-memo oracle 比對 1,000 個 seeded states 通過，分布總和為 1。
- Review / Audit：由主 Agent 進行 fallback review；此環境沒有獨立 reviewer；目前無未解發現。
- Commit / PR：依 Owner 指示不 commit、不 push。
- Claude Code 驗收（2026-10-12）: 第一輪退回 375px 等級名稱字中斷行（PERFEC/T、NORMA/L），Codex 改為 ≤480px 三欄＋nowrap 並加 e2e 單行斷言；第二輪 375px／1280px 截圖確認。實作對三個固定案例的輸出以臨時測試直接列印，與 Claude Code 不共用程式碼的獨立腳本完全一致（34.22／11.6／29.9／37.4／0.0／21.1；34.41／11.0／32.9／33.8／0.0／22.3；36.62／16.2／36.4／9.4／0.0／38.1）。獨立重跑 lint 0 error、typecheck 0 error、unit 226/226、e2e 122/122、benchmark p95 最慢 27.8 ms、計算超限 0。PASS。
- Commit / PR（Claude Code）: 依 README Git 授權 commit／push 至 `main`，觸發 Vercel Production 自動部署（Owner 授權驗收通過即部署）。
