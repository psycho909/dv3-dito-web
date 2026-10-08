# 04 補滿邊界與週期紀錄

- Status: approved
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

局末剩餘少於 15 時，下一局自動換新 52 顆並留下可追溯的週期紀錄，玩家可一鍵確認遊戲是否真的補滿。

## Scope

- FR-03：`DeckCycle`（reason、triggeredByRoundId、previousRemaining、observation）、START_ROUND 的 `cycleCreated`、CONFIRM_CYCLE_OBSERVATION。
- UI：「下局預計補滿」提示、新局非阻擋提示「遊戲現在顯示 52 顆嗎？」（是／不是／稍後）、回答「不是」進入 UNSYNCED。
- 測試：T11、T12、T13、T21、T32、AC-03。

## Out of Scope

- 歷史修正（09）、手動重置（10）。

## Acceptance

- [ ] 剩 15 換局不重置；剩 14 換局建立新週期，`previousRemaining = 14`；局中剩 14 不重置。
- [ ] 回答「是／不是」分別記錄 `CONFIRMED_52`／`DENIED`，`不是` 時牌池為 UNSYNCED。

## Constraints and Decisions

- 補牌時機是待實測假設；若 Ticket「遊戲待確認規則實測」結果不同，先修規則文件再改本票。

## Dependencies and Blockers

- Blocked by：03。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
