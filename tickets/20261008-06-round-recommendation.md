# 06 本局推薦提示

- Status: approved
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」；演算法依三輪原型結論（`docs/research/`）
- Risk: L2
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

每次輸入後，在機率卡下方顯示以「最終點數接近 21」為目標的本局停手／再抽建議。

## Scope

- FR-13：`recommendWithinRound` exact expectimax、每局清空快取、狀態／時間上限回傳 `COMPUTATION_LIMIT`、各種閘門（UNSYNCED／N=0／21／BURST／0 分）。
- UI：D2 RecommendationHint（只看本局、常駐「不代表獎勵最高」小字、限制時顯示「目前無法計算建議」）。
- 測試：T34～T37、AC-14。

## Out of Scope

- L2 週期修正（附錄，未採用）、Web Worker（除非瀏覽器實測超標）。

## Acceptance

- [ ] 4、7、6 建議 `STOP`，stopDistance 4，drawExpectedDistance `15.755102040816325`（容差 1e-9）。
- [ ] 與無 memo 暴力枚舉 1,000 組比對一致；全新 52 顆空手牌不觸發上限。
- [ ] 瀏覽器（Playwright CPU 4×、手機 viewport）p95 < 50 ms 有量測紀錄。

## Constraints and Decisions

- BURST 距離固定 22；不使用 Monte Carlo。

## Dependencies and Blockers

- Blocked by：02。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
