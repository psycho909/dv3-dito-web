# 05 本機持久化

- Status: approved
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

重新整理或重開頁面後，所有週期、回合與手牌都能正確恢復；資料損毀時不會默默清空。

## Scope

- FR-08 本機部分：`PersistedSession`（schemaVersion 1）、`LocalEnvelope`（雲端欄位保留但不使用）、原子性寫入；選型 localStorage 或 IndexedDB 並在 README 說明。
- 讀取失敗、結構損毀、版本不相容時進入安全錯誤狀態並提供匯出原始資料的入口。
- CloudBackupStatus 只顯示「僅本機」。

## Out of Scope

- JSON 匯入匯出（10）、雲端同步（S2）。

## Acceptance

- [ ] 記 3 顆並完成本局，重新整理後歷史與剩餘數相同（AC-08 本機前半）。
- [ ] 人為破壞儲存資料後顯示錯誤狀態，原資料未被覆寫。
- [ ] 機率、剩餘數不被持久化，均由紀錄重算。

## Constraints and Decisions

- 持久化只保存事件與週期，不保存衍生結果。

## Dependencies and Blockers

- Blocked by：04。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
