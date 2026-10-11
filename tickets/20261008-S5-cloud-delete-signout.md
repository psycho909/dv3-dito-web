# S5 雲端刪除與登出保護

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-12 Owner 選擇「先完成 S4／S5，再一起發布」；依本票施工，驗收後一併發布。
- Risk: L3
- Updated: 2026-10-12
- Branch: codex/github-cloud-complete
- Git / Remote authority: 依 README；Owner 授權 S4／S5 驗收後與 S1／S2 一併 PR、合併 main、Production 發布。

## Goal

玩家可以安全刪除雲端紀錄或登出，舊裝置的資料不會再寫回，未上傳的紀錄不會遺失。

## Scope

- FR-12：`delete_forge_data`（墓碑 revision）、只清本機 vs 刪除雲端與本機、登出／切換身分前的待傳保護。
- UI：雲端狀態、最後備份時間、待同步數、立即重試、刪除確認文案（說明保留最少量版本紀錄）。
- 測試：T29、AC-13。

## Out of Scope

- 刪除 Auth 帳號本身。

## Acceptance

- [x] 雲端刪除需線上取得伺服器確認才顯示完成；舊佇列與舊 revision 無法復活資料。
- [x] 只清本機後再連同帳號，會詢問是否恢復遠端紀錄，不會覆蓋雲端。
- [x] 有待傳資料時登出被阻止或要求先匯出。

## Constraints and Decisions

- 不宣稱已完全刪除帳號或所有中繼資料。

## Dependencies and Blockers

- S2 技術驗收已通過，整合驗收完成。

## Evidence

- Verification: 2026-10-12 unit 198/198、E2E 116/116（桌機／375px）、typecheck、lint、build、產物檢查及 diff check PASS。雲端 E2E 攔截 Supabase API，未寫入正式資料。
- Review / Audit: 獨立 Auditor Standards／Spec PASS；主 Agent Final Review 可接受，Owner 條件式核准已滿足。[報告](../reports/audit/20261012-cloud-lifecycle.md)。
- Commit / PR: codex/github-cloud-complete；發布由 D2 留存證據。
