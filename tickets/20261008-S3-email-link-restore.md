# S3 Email 連結與跨裝置恢復

- Status: draft
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 未取得
- Risk: L3
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README

## Goal

玩家把匿名身分連結到已驗證 Email，就能在另一台裝置登入同一身分並恢復紀錄。

## Scope

- FR-10：`updateUser({ email })` 連結同一 UID；新裝置 `signInWithOtp`（`shouldCreateUser: false`）。
- UI：CloudSettingsDrawer 的身分區塊、匿名限制警示、恢復前摘要。
- 測試：T28。

## Out of Scope

- 兩端資料不同時的衝突處理（S4）。

## Acceptance

- [ ] 連結 Email 後 UID 不變；新裝置 OTP 登入後恢復相同週期、手牌與歷史。
- [ ] 未連結時畫面明確顯示不可跨裝置恢復。
- [ ] 輸入未連結的 Email 不會建立新帳號。

## Constraints and Decisions

- 不建立獨立註冊流程。

## Dependencies and Blockers

- Blocked by：S2。
- 需要 Supabase Email 寄送設定。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
