# S2 匿名雲端備份與離線佇列

- Status: draft
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 未取得
- Risk: L3
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README

## Goal

玩家啟用匿名雲端備份後，斷線也能繼續記牌，恢復連線時待傳紀錄依序安全上傳。

## Scope

- FR-08 雲端部分、FR-10 匿名登入（Turnstile、Manual Linking 設定說明）、FR-11 佇列與冪等重送。
- `@supabase/supabase-js`（鎖定版本）、`cloudAuth`、`cloudSync`、`forgeCloudRepository`。
- UI：CloudBackupStatus 全狀態、首次啟用說明。
- 週期邊界、觀察與歷史修正事件必須上雲（T33）。
- 測試：T23、T24、T25、T30、T33、AC-11。

## Out of Scope

- Email 連結（S3）、衝突處理（S4）、刪除（S5）。

## Acceptance

- [ ] 斷網輸入 4、7、6 → 畫面立即正確並顯示待備份；重新整理後佇列仍在；復網提交一次、待同步歸零。
- [ ] 雲端未設定或 Auth 失敗時仍可本機使用，顯示「僅本機」。
- [ ] `SyncState` 與 `CloudBackupStatus` 互不影響。

## Constraints and Decisions

- 前端只用 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`。

## Dependencies and Blockers

- Blocked by：S1、12。
- 需要 Owner 提供 Turnstile site key，並在 Dashboard 啟用匿名登入與 Manual Linking。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
