# 12 本機版 V1 總驗收

- Status: approved
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

確認本機版 V1 端到端可用，所有證據齊全，可以交給部署與雲端階段。

## Scope

- `docs/開發規格.md` §5 e2e（雲端項目除外）：PC 4/7/6 → 完成 → 新局仍 49；手機 375 單手流程；重新整理；UNSYNCED 警示；鍵盤。
- 完整執行 lint、typecheck、unit、build、e2e 並收集證據。
- README：手動同步玩法、待確認遊戲規則清單。
- 手機與桌機人工驗證一次完整跨局操作。

## Out of Scope

- 部署（D1）、Supabase（S1～S5）。

## Acceptance

- [ ] 01～11 全部 accepted。
- [ ] 五個驗證命令全部通過，有可重現紀錄。
- [ ] `docs/UIUX Design.md` §11 驗收清單中非雲端項目全部勾選並附證據。

## Constraints and Decisions

- 未執行的檢查不得記為通過。

## Dependencies and Blockers

- Blocked by：11。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
