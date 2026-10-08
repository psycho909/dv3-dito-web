# 08 與遊戲核對剩餘數

- Status: approved
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

玩家輸入遊戲顯示的剩餘數；不一致時工具明確標示牌池未同步，不再顯示精確機率與推薦。

## Scope

- FR-06：VERIFY_REMAINING 事件、UNSYNCED 狀態與恢復路徑（撤銷、修正紀錄、等待重補滿重新同步）。
- UI：核對入口、UNSYNCED 時主機率卡改為阻擋狀態、推薦隱藏。
- 測試：T16、AC-06。

## Out of Scope

- 歷史修正本身（09）。

## Acceptance

- [ ] 輸入 3 顆但遊戲顯示 48 → UNSYNCED，不顯示精確 % 與推薦；補上遺漏點數後恢復。
- [ ] 不會用剩餘總數差額自動扣除任何點數。

## Constraints and Decisions

- `SyncState` 與雲端備份狀態完全獨立。

## Dependencies and Blockers

- Blocked by：05。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
