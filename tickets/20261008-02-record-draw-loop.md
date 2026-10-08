# 02 記牌最小閉環

- Status: approved
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

玩家確認從 52 顆開始記錄後，點數鍵輸入就能即時看到分數、剩餘數與五級距下一抽機率。

## Scope

- FR-01、FR-04、FR-05：初始牌池、A 的 1/11 計分、`calculateNextDraw` 輸出契約、牌池驗證。
- UI：DeckIntegrityStatus（UNINITIALIZED／SYNCED）、HandSummary、RankKeypad（5×2、剩餘數、用罄 disabled）、ProbabilityBreakdown（固定順序、百分比、比例條）。
- 測試：T01～T10、T17、T18。

## Out of Scope

- 撤銷、換局、持久化、推薦、明細抽屜。

## Acceptance

- [ ] 4、7、6 後畫面顯示 17/21、剩 49、`6.12% / 16.33% / 8.16% / 0.00% / 69.39%`。
- [ ] AC-01、AC-04、AC-05 有自動化測試且通過。
- [ ] 某點數用完後該鍵 disabled 並顯示「剩 0」；牌池空時不出現 NaN。

## Constraints and Decisions

- 剩餘數由事件推導，不另維護計數器；機率用整數顆數計算，顯示才捨入（最大餘數分配）。

## Dependencies and Blockers

- Blocked by：01。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
