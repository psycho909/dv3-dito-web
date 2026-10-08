# 09 歷史與智慧型歷史修正

- Status: approved
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」；智慧型修正由 Owner 確認「能達到智慧型紀錄去做調整就符合我的預期」
- Risk: L2
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

玩家可以查看所有局的歷史，修正舊局記錯的點數；工具從頭重算並預覽影響，確認後才套用。

## Scope

- FR-03 智慧型歷史修正：從第一個週期重播、預覽受影響回合與邊界新增／移除／移位；推定邊界自動調整；CONFIRMED_52、MANUAL_RESET、USER_CONFIRMED_FULL 固定並在不符時警告；只有非法重播（超抽、引用錯誤）才拒絕；單一 CORRECT_HISTORY 事件。
- UI：HistoryDrawer（局次、順序、最終分數與級距、週期分隔線與觀察狀態）、修正預覽。
- 測試：T20、T22、T31。

## Out of Scope

- 雲端上傳 CORRECT_HISTORY（S2）。

## Acceptance

- [ ] 把剩 14 改成剩 15 時，預覽顯示邊界移除，確認後後續牌池正確。
- [ ] 已確認 52 的邊界在修正後保持不動並顯示規則不符警告。
- [ ] 造成超抽的修正被拒絕並指出衝突回合，資料不變。

## Constraints and Decisions

- 修正在套用前不改動任何既有資料。

## Dependencies and Blockers

- Blocked by：05。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
