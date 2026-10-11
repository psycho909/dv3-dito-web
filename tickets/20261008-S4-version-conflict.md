# S4 雲端版本衝突處理

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-12 Owner 選擇「先完成 S4／S5，再一起發布」；依本票施工，驗收後一併 PR／合併／Production 發布。
- Risk: L3
- Updated: 2026-10-12
- Branch: codex/github-cloud-complete
- Git / Remote authority: 依 README commit／push；Owner 授權 S4／S5 完成驗收後與 S1／S2 一起 PR、合併 main 並發布。

## Goal

兩台裝置修改同一份雲端紀錄時，後提交的一方不會覆蓋對方，玩家可以比較並選擇要保留的版本。

## Scope

- FR-11：VERSION_CONFLICT 處理、首次啟用三情境（遠端空／本機空／兩端都有）、OVERWRITE_CLOUD_FROM_LOCAL。
- UI：CloudConflictDialog（兩端摘要、匯出兩版、以雲端恢復／確認以本機覆蓋）。
- 測試：T26、AC-12。

## Out of Scope

- 自動合併兩副牌池（規格明確禁止）。

## Acceptance

- [x] 第一台成功、第二台衝突且本機與待送資料完整保留。
- [x] 選擇以本機覆蓋時使用新 mutationId 與最新 revision，伺服器確認前不清除舊佇列。
- [x] timeout 重送冪等；切換帳號時不越權上傳。

## Constraints and Decisions

- 不採 last-write-wins，不用時間判斷誰正確。

## Dependencies and Blockers

- S2 技術驗收已通過，整合驗收完成。

## Evidence

- Verification: 2026-10-12 unit 198/198、E2E 116/116（桌機／375px）、typecheck、lint、build、產物檢查及 diff check PASS。雲端 E2E 攔截 Supabase API，未寫入正式資料。
- Review / Audit: 獨立 Auditor Standards／Spec PASS；主 Agent Final Review 可接受，Owner 條件式核准已滿足。[報告](../reports/audit/20261012-cloud-lifecycle.md)。
- Commit / PR: codex/github-cloud-complete；發布由 D2 留存證據。
