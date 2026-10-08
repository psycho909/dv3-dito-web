# S4 雲端版本衝突處理

- Status: draft
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 未取得
- Risk: L3
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README

## Goal

兩台裝置修改同一份雲端紀錄時，後提交的一方不會覆蓋對方，玩家可以比較並選擇要保留的版本。

## Scope

- FR-11：VERSION_CONFLICT 處理、首次啟用三情境（遠端空／本機空／兩端都有）、OVERWRITE_CLOUD_FROM_LOCAL。
- UI：CloudConflictDialog（兩端摘要、匯出兩版、以雲端恢復／確認以本機覆蓋）。
- 測試：T26、AC-12。

## Out of Scope

- 自動合併兩副牌池（規格明確禁止）。

## Acceptance

- [ ] 第一台成功、第二台衝突且本機與待送資料完整保留。
- [ ] 選擇以本機覆蓋時使用新 mutationId 與最新 revision，伺服器確認前不清除舊佇列。
- [ ] timeout 重送冪等；切換帳號時不越權上傳。

## Constraints and Decisions

- 不採 last-write-wins，不用時間判斷誰正確。

## Dependencies and Blockers

- Blocked by：S2。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
