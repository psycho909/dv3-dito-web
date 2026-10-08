# V1 Supabase 雲端紀錄與備份

> 2026-10-08 已由 Owner 核准拆票取代：S1～S5、D2（見 `TODO.md`）。本檔只保留歷史，不再是目前狀態正本。

- Status: archived
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 未取得
- Risk: L3（Auth、RLS、使用者資料、外部服務）
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README；Supabase 專案設定、migration 套用到遠端與部署需另行授權

## Goal

依 `docs/開發規格.md` FR-08（雲端部分）、FR-10～FR-12，為本機優先計算器加入 Supabase 匿名雲端備份、Email 連結跨裝置恢復、離線佇列、版本衝突與資料刪除。

## Scope

- `@supabase/supabase-js`、`cloudAuth.ts`、`cloudSync.ts`、`supabaseClient.ts`、`forgeCloudRepository.ts`。
- `supabase/migrations/`：`forge_states`、`forge_mutations`、RLS、grants（revoke PUBLIC／anon）、`commit_forge_state`、`delete_forge_data` RPC。
- `supabase/tests/`：RLS／RPC 權限、冪等、衝突 pgTAP。
- UI：CloudBackupStatus 全狀態、CloudSettingsDrawer、CloudConflictDialog。
- 測試 T23～T30、T33 與雲端 e2e。

## Out of Scope

- 匿名帳號清理（Owner 決定不清理）。
- 部署與正式環境資料。

## Acceptance

- [ ] AC-08（雲端部分）、AC-10～AC-13 有自動化或可重現證據。
- [ ] `supabase test db`（或等效 RLS／RPC 整合測試）通過。
- [ ] 前端不含 `service_role` 或其他高權限密鑰。

## Constraints and Decisions

- 依 FR-10：匿名登入 + Manual Linking + Turnstile；`signInWithOtp` 的 `shouldCreateUser=false`。
- 雲端故障不得阻斷本機計算；`SyncState` 與 `CloudBackupStatus` 獨立。

## Dependencies and Blockers

- 依賴 `tickets/20261008-v1-local-first-app.md` 完成。
- 需要 Owner 提供：測試用 Supabase 專案（URL、publishable key）、Turnstile site key；Dashboard 啟用匿名登入、Manual Linking、Email 驗證。
- 本機 `supabase test db` 需要 Supabase CLI 與 Docker，環境可用性未確認。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
