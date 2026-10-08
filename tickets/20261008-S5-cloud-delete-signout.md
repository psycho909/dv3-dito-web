# S5 雲端刪除與登出保護

- Status: draft
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 未取得
- Risk: L3
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README

## Goal

玩家可以安全刪除雲端紀錄或登出，舊裝置的資料不會再寫回，未上傳的紀錄不會遺失。

## Scope

- FR-12：`delete_forge_data`（墓碑 revision）、只清本機 vs 刪除雲端與本機、登出／切換身分前的待傳保護。
- UI：雲端狀態、最後備份時間、待同步數、立即重試、刪除確認文案（說明保留最少量版本紀錄）。
- 測試：T29、AC-13。

## Out of Scope

- 刪除 Auth 帳號本身。

## Acceptance

- [ ] 雲端刪除需線上取得伺服器確認才顯示完成；舊佇列與舊 revision 無法復活資料。
- [ ] 只清本機後再連同帳號，會詢問是否恢復遠端紀錄，不會覆蓋雲端。
- [ ] 有待傳資料時登出被阻止或要求先匯出。

## Constraints and Decisions

- 不宣稱已完全刪除帳號或所有中繼資料。

## Dependencies and Blockers

- Blocked by：S2。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
