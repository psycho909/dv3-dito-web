# 03 本局撤銷與跨局承接

- Status: approved
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

玩家可以撤銷本局誤輸入、完成本局並開始新局，牌池正確承接到下一局。

## Scope

- FR-02、FR-07：`gameReducer` 的 RECORD_DRAW、UNDO_DRAW、FINISH_ROUND、START_ROUND（不含補滿）；撤銷只限 ACTIVE 回合，空手牌時 disabled；完成本局、開始新局不可撤銷。
- UI：撤銷按鈕與「已撤銷：6」回饋、完成本局、開始新局。
- 測試：T14（不含重做）、AC-02、AC-07。

## Out of Scope

- 補滿邊界、持久化、重做（選做）。

## Acceptance

- [ ] 4、7、6 撤銷後為 4、7、11/21、剩 50。
- [ ] 完成本局後開新局，手牌 0、剩 49，4／7／6 各少 1。
- [ ] 連續撤銷到空手牌後按鈕 disabled，不影響上一局。

## Constraints and Decisions

- 撤銷範圍已由 Owner 決定：只限本局。

## Dependencies and Blockers

- Blocked by：02。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
