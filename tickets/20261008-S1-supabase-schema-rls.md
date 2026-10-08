# S1 Supabase 資料表、RLS、RPC 與 pgTAP

- Status: draft
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 未取得（L3，需 Owner 對安全設計明確核准）
- Risk: L3
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；migration 套用到遠端 Supabase 專案需另行授權

## Goal

建立只允許使用者讀寫自己紀錄的雲端資料層，並以資料庫測試證明權限、冪等與版本衝突防護。

## Scope

- FR-10：`forge_states`、`forge_mutations`、索引、RLS、grants（revoke PUBLIC／anon）、`commit_forge_state`、`delete_forge_data`（SECURITY DEFINER、固定 search_path、驗證 `auth.uid()`、大小上限、`ForgeActionType` 驗證）。
- `supabase/tests/` pgTAP：AC-10、T27、RPC 冪等與 `VERSION_CONFLICT`。

## Out of Scope

- 前端整合（S2 起）。

## Acceptance

- [ ] `supabase test db` 通過：A 不能讀寫 B、未登入者全部拒絕、直接 PostgREST 改寫被拒。
- [ ] 同 mutationId 重送不重複；同 ID 不同內容被拒；舊 revision 回 `VERSION_CONFLICT`。

## Constraints and Decisions

- 匿名帳號不清理（Owner 決定）。
- `service_role` 與資料庫密碼不得進入版控或前端。

## Dependencies and Blockers

- Blocked by：05（`PersistedSession` 定型）。
- 需要 Owner 提供測試用 Supabase 專案；本機需 Supabase CLI 與 Docker。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
