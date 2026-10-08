# 07 牌池與逐點數明細

- Status: approved
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L1
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

玩家可以展開查看剩餘牌池各點數數量，以及每個點數抽到後的分數與級距。

## Scope

- UIUX E RankOutcomeDetail（10 筆：剩餘、機率、抽後點數、級距）；手機改小卡，不強制橫向捲動。
- UIUX F DeckStatus／DeckDetailDrawer（剩餘 N／52、各點數剩餘、手動紀錄說明）。

## Out of Scope

- 補滿提示（04 已做）。

## Acceptance

- [ ] 4、7、6 時明細與 `docs/UIUX Design.md` §6E 範例一致。
- [ ] 抽屜有 ARIA 名稱、可用鍵盤開關並返回焦點。
- [ ] 375px 下明細無水平溢出。

## Constraints and Decisions

- 明細與主卡使用同一份 `calculateNextDraw` 結果。

## Dependencies and Blockers

- Blocked by：02。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
