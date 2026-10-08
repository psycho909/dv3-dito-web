# 10 匯出、匯入、重置與清除

- Status: approved
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

玩家可以備份與還原紀錄，並在明確確認後重置牌池或清除本機資料。

## Scope

- FR-08：JSON 匯出、匯入（格式、版本、牌池、週期邊界、引用驗證；預覽摘要；以 IMPORT_OVERWRITE 覆蓋）。
- FR-02：重置牌池（MANUAL_RESET，舊週期保留）、清除此裝置資料；兩者皆二次確認、說明影響。
- 測試：T15、T19、AC-08 本機後半。

## Out of Scope

- 刪除雲端紀錄（S5）。

## Acceptance

- [ ] 匯出 → 清空 → 匯入後歷史、牌池、機率完全相同。
- [ ] 不合法、超抽或版本不符的檔案被拒絕，原資料不受影響。
- [ ] 匯出檔不含認證資訊。

## Constraints and Decisions

- 匯入 JSON 不執行任何程式碼；危險操作不使用 toast 直接執行。

## Dependencies and Blockers

- Blocked by：05。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
