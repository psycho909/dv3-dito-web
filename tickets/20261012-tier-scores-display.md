# 顯示各等級得分

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-12 Owner 於 Session 提供得分「good 20／great 50／perfect 100／bust 1」，並選擇「先做得分顯示，推薦等實測」；NORMAL 得分回覆「還不確定」；倍率與成本「不考慮」。
- Risk: L1（新增顯示；不改推薦目標、不改已存資料格式）
- Updated: 2026-10-12
- Branch: main
- Git / Remote authority: 依 README（驗證通過後 commit／push 到目前分支）；不開 PR；推送 main 觸發 Vercel Git integration 自動部署 Production（Owner 2026-10-12 授權 review 通過即部署）。

## Goal

把 Owner 確認的各等級得分記入規則並顯示在工具上，讓玩家看到每種結果對應的得分；NORMAL 得分未確認時明確標示。

## Scope

- `src/domain/rules.ts` 集中定義等級得分：PERFECT 100、GREAT 50、GOOD 20、BURST 1；NORMAL 為「未確認」（不得以 0 或其他數字代入）。
- 「再抽 1 顆，可能的結果」（`ProbabilityBreakdown`）每個等級顯示得分；NORMAL 顯示「得分未確認」。
- 完成本局後（FINISHED 狀態的結果區）顯示本局等級與得分；NORMAL 顯示「得分未確認」。
- `docs/遊戲詳細規則.md` §4／§7 記錄得分與來源（Owner 2026-10-12）、NORMAL 仍待確認；`docs/開發規格.md` 補充得分僅供顯示，FR-13 推薦目標維持「接近 21」直到 NORMAL 確認。
- 對應單元測試與 e2e；確認 375px 不溢出、無障礙文字（aria）包含得分。

## Out of Scope

- 推薦引擎改為期望得分（等 NORMAL 得分實測後另開 Ticket）。
- 期望得分彙總數字（依賴 NORMAL，暫不顯示）。
- 下注倍率、強化成本。
- 歷史紀錄、備份、雲端資料格式不新增欄位。

## Acceptance

- [x] 機率表每個等級顯示正確得分，NORMAL 顯示「得分未確認」。
- [x] 完成本局後顯示等級與得分（例：GREAT 50 分；BURST 1 分；NORMAL 得分未確認）。
- [x] 得分常數集中於 `rules.ts`，無其他硬編碼。
- [x] 推薦行為與文字不變（既有推薦測試全過）。
- [x] 規則與規格文件已更新，含來源與日期。
- [x] `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`npx playwright test` 全部通過。

## Constraints and Decisions

- UI 不得把得分描述成「最佳收益」；推薦仍以接近 21 為目標。
- NORMAL 得分確認後：改常數並另開推薦改版 Ticket。

## Dependencies and Blockers

- 施工排在 `20261012-refill-at-15` 驗收後（兩者都修改規則文件）。

## Evidence

- Verification: TDD RED：新增單元測試先因機率列未顯示 `100 分` 失敗；修正後 `npm.cmd run lint` 0 error／0 warning、`npm.cmd run typecheck` 通過、`npm.cmd test` 15 files／202 tests passed、`npm.cmd run build` 124 modules 通過、`npx.cmd playwright test --reporter=dot` 120 tests passed（mobile＋desktop）；375px e2e、aria 與三種完局結果均通過。
- Review / Audit: 主 Agent 自查 Scope、diff 與測試；得分常數僅在 `src/domain/rules.ts`，推薦引擎／文案與 persistence／cloud 資料格式未修改；`git diff --check` 通過。
- Review / Audit（驗收）: Claude Code 2026-10-12 獨立驗收 PASS：審查 src 差異（得分僅定義於 `TIER_SCORES`，NORMAL 以 `UNCONFIRMED` 型別表達、無數值；推薦引擎、persistence、cloud 未修改）與文件差異；獨立重跑 lint 0 error、typecheck 0 error、unit 202/202、e2e 120/120。
- Commit / PR: Claude Code（施工：Codex）依 README Git 授權 commit／push 至 `main`；不開 PR；推送 main 觸發 Vercel Git integration 自動部署 Production（Owner 2026-10-12 授權 review 通過即部署）。
