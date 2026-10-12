# 推薦改為最大化期望得分

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-12 Owner 於 Session 選擇得分用途「顯示＋推薦改為期望得分」，並因 NORMAL 未知選擇「先做得分顯示，推薦等實測」；同日回報實測「normal 分數為5」，解除阻塞。倍率與成本「不考慮」。
- Risk: L2（推薦核心行為與 FR-13 規格變更）
- Updated: 2026-10-12
- Branch: main
- Git / Remote authority: 依 README（驗證通過後 commit／push 到目前分支）；不開 PR；推送 main 觸發 Vercel Git integration 自動部署 Production（Owner 2026-10-12 授權 review 通過即部署）。

## Goal

FR-13 停手／再抽建議的目標由「最終點數最接近 21」改為「最大化本局期望得分」，得分為 PERFECT 100、GREAT 50、GOOD 20、NORMAL 5、BURST 1。

## Scope

- `src/domain/rules.ts`：NORMAL 得分改為已確認 5；`TIER_SCORES` 全部為已確認數值，移除只為「未確認」存在的型別與 UI 分支（NORMAL 顯示「5 分」）。
- `src/domain/recommendation.ts`：expectimax 以得分為價值。`V(停) = TIER_SCORES[classify(總分)]`；`V(抽) = Σ c[r]/N × V*(手牌+r, 牌池−r)`；`V* = max(V(停), V(抽))`；遞迴到 21、BURST 或牌池空即停。精確枚舉與 memo、`maxStates`／`maxTimeMs` 計算上限、閘門（UNSYNCED→NONE、空牌池→NONE、21→AT_21、BURST→BURST）維持。目前 0 點仍一律 DRAW。期望值相等時建議停手。
- `withinRound` 比較改為 `stopScore`／`drawExpectedScore`（取代 `stopDistance`／`drawExpectedDistance`）；理由列舉改為以得分描述（`HIGHER_EXPECTED_SCORE`／`STOP_SCORE_HIGHER_OR_TIED`）。推薦結果不持久化（既有測試保證），無資料相容問題。
- 移除不再使用的 `BURST_DISTANCE`。
- `RecommendationHint` 文案改為比較「停手得分」與「再抽期望得分（之後依最佳策略）」；說明文字改為「以本局期望得分為目標」，不使用「最賺」「最佳收益」，並註明不含倍率與強化成本。
- 更新 `docs/開發規格.md` FR-13（目標、公式、理由、測試案例表）、`docs/遊戲詳細規則.md`（NORMAL 5 分，來源 Owner 2026-10-12）、`docs/UIUX Design.md` 相關文案；CHANGELOG。
- 更新單元測試（含「獨立 no-memo oracle 1,000 組隨機牌池」改為得分目標）、e2e 推薦流程測試；執行效能基準 `node tests/benchmarks/recommendation.mjs`（p95 < 50 ms、全新 52 顆不觸發計算上限）。

## Out of Scope

- 下注倍率、強化成本、跨局（週期）最佳化。
- 備份／雲端資料格式。

## Acceptance

- [x] NORMAL 顯示 5 分；`TIER_SCORES` 為唯一得分來源。
- [x] 推薦以期望得分決策，與獨立 no-memo oracle 在 1,000 組隨機牌池一致。
- [x] 至少一組手算案例驗證（滿 52 顆、手牌 10、6＝16 時停手得分 20、再抽期望得分 19.8，已寫入測試與規格）。
- [x] 閘門行為不變：UNSYNCED／空牌池 NONE、21 AT_21、BURST BURST、0 點 DRAW；計算上限仍回 COMPUTATION_LIMIT。
- [x] UI 文案顯示停手得分與再抽期望得分，不含「最佳收益」等字樣；375px 不溢出。
- [x] 效能基準通過（p95 < 50 ms）。
- [x] 規格、規則文件與 CHANGELOG 已更新。
- [x] `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`npx playwright test` 全部通過。

## Constraints and Decisions

- 得分只計單局固定等級得分，不乘倍率、不扣成本（Owner 2026-10-12）。
- BURST 1 分高於 0，但低於 NORMAL 5 分；因此停在 NORMAL 仍優於確定爆牌。

## Dependencies and Blockers

- 無（NORMAL 得分已由 Owner 2026-10-12 提供）。

## Evidence

- Verification:
  - HEAD 前後均為 `15664d6`；沒有 staged 變更，未 commit／push。工作範圍為本 Ticket 的 16 個 tracked 實作／文件／測試檔與此新增 Ticket；`TODO.md`、`tickets/20261008-game-rule-observation.md` 為 Owner 既有修改，保留且排除於本次實作範圍。
  - `npm.cmd run lint`：通過；`npm.cmd run typecheck`：通過。
  - `npm.cmd test`：15 個測試檔、203 tests 通過（16.59 秒）。
  - `npm.cmd run build`：通過，轉換 124 modules（3.92 秒）。
  - `npx.cmd playwright test`：120 passed（1.0 分鐘，含 mobile／desktop）。
  - `node tests/benchmarks/recommendation.mjs`：4 案例各 100 次、計算超限均為 0；p95：全新 52 顆 17.8 ms、20 階級 4.0 ms、12 階級 0.6 ms、4-7-6 剩 49 顆 0.3 ms，均低於 50 ms。
  - `git diff --check`：無 whitespace error；Git 對 `docs/遊戲詳細規則.md` 與既有 Owner Ticket 顯示 LF／CRLF 提醒。
- Review / Audit:
  - Scope：基準／目前 HEAD `15664d6`；以 `git diff -- <task paths>` 檢視 unstaged 差異，`git diff --cached -- <task paths>` 為空，`git ls-files --others --exclude-standard` 列出並完整閱讀新增 Ticket。task paths：`CHANGELOG.md`、`docs/UIUX Design.md`、`docs/遊戲詳細規則.md`、`docs/開發規格.md`、`src/App.vue`、`src/components/ProbabilityBreakdown.vue`、`src/components/RecommendationHint.vue`、`src/domain/recommendation.ts`、`src/domain/rules.ts`、`tests/benchmarks/recommendation.mjs`、`tests/e2e/record-draw.spec.ts`、`tests/e2e/round-recommendation.spec.ts`、`tests/unit/App.test.ts`、`tests/unit/RecommendationHint.test.ts`、`tests/unit/forgeStore.test.ts`、`tests/unit/recommendation.test.ts`、`tickets/20261012-recommend-expected-score.md`。排除 Owner 既有的 `TODO.md` 和 `tickets/20261008-game-rule-observation.md`；工作樹由 `git status --short` 確認。
  - Reviewer：未參與施工的獨立 reviewer（Luna Medium review role）；執行環境未提供可確認的模型名稱，故不推測。Standards：PASS；Spec：PASS。手算案例初始疑義經重算後撤回，沒有未解 finding；本 L2 任務未觸發 Independent Audit。
  - Disposition：工程與驗證條件具備；依 Owner 指示保留 `in_progress`，待 Owner 驗收。
  - Claude Code 驗收 2026-10-12 PASS：審查 recommendation／rules／RecommendationHint 差異（價值函數 `TIER_SCORES[classify]`、max 期望、平手停手、0 點 DRAW、閘門不變；數值 memo key 經上界檢查 < 2^53 無碰撞）；以不共用程式碼的獨立 oracle 重算 10、6 → 停手 20／再抽 19.80、4、7、6 → 20／16.6122，與實作一致；獨立重跑 lint 0 error、typecheck 0 error、unit 203/203、e2e 120/120、benchmark p95 最慢 22.1 ms、計算超限 0。
- Commit / PR: Claude Code（施工：Codex）依 README Git 授權 commit／push 至 `main`；不開 PR；推送 main 觸發 Vercel Git integration 自動部署 Production（Owner 2026-10-12 授權 review 通過即部署）。
- Deployment: 2026-10-12 Claude Code 核對 GitHub commit status：`6f53f92`、`26d4c59`、`15664d6`、`b645c6f` 的 Vercel 部署皆 success；正式網站 bundle `index-DgJvxo6A.js` 含新文案、不含舊文案，CSP／nosniff／Referrer-Policy 標頭存在；Chromium 375px 與 1280px 未登入煙霧測試（10、6 → 建議停手 20／19.80、NORMAL 5 分）無溢出、無頁面錯誤。
