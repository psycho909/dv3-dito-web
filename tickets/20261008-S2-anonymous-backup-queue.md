# S2 GitHub 雲端備份與離線佇列

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-11 Owner 要求繼續並直接操作，明確取消 Cloudflare 並選擇「只用既有 GitHub 登入啟用備份」。依本票更新後 Scope 施工。
- Risk: L3
- Updated: 2026-10-12
- Branch: codex/github-cloud-complete
- Git / Remote authority: 依 README

## Goal

玩家以 GitHub 登入並確認啟用雲端備份後，斷線也能繼續記牌，恢復連線時待傳紀錄依序安全上傳。

## Scope

- FR-08 雲端部分、FR-10 改用既有 GitHub 登入（Owner 本 Session 決策）、FR-11 佇列與冪等重送。
- `@supabase/supabase-js`（鎖定版本）、`cloudAuth`、`cloudSync`、`forgeCloudRepository`。
- UI：CloudBackupStatus 全狀態、首次啟用說明。
- 週期邊界、觀察與歷史修正事件必須上雲（T33）。
- 測試：T23、T24、T25、T30、T33、AC-11。

## Out of Scope

- Email 連結（Owner 已取消／S3 archived）、完整衝突選版（S4）、雲端刪除（S5）；本票仍提供衝突停止與待送資料保護。

## Acceptance

- [x] 斷網輸入 4、7、6 → 畫面立即正確並顯示待備份；重新整理後佇列仍在；復網提交一次、待同步歸零（unit及mocked-Supabase瀏覽器runtime）。
- [x] 雲端未設定或 Auth 失敗時仍可本機使用，顯示「僅本機」。
- [x] `SyncState` 與 `CloudBackupStatus` 互不影響。

## Constraints and Decisions

- 前端只用 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`。

## Dependencies and Blockers

- S1、12 已完成；原 Turnstile 外部阻塞已由 Owner 新方案解除。
- Owner 2026-10-11 取消 Cloudflare／匿名備份，沿用 GitHub；不需要 Turnstile、匿名登入或 Manual Linking。先前 key 缺口已解除。
- Owner 2026-10-12 指示「先完成 S4／S5，再一起發布」；兩票驗收已完成，條件式最終核准與發布授權已滿足。正式發布證據見 D2。

## Evidence

- Verification: 2026-10-12 全套unit189項PASS、typecheck/lint/build、diff check通過。桌機/375px雲端mock e2e2項PASS；全套116案例首輪106PASS/10舊文案或過廣selector失敗，修正僅對應測試後26項受影響e2e全部PASS。無正式測試帳號／資料，不把mock稱Production驗證。
- Review / Audit: 未施工獨立context，工具明確派工gpt-6-luna/max/fork_turns=none（無backendtelemetry）；Standards／Spec與finding解除增量PASS。[S2 Audit證據](../reports/audit/20261012-S2-github-cloud-backup.md)。Final Review技術可交付，L3 Owner最終核准尚待。
- Commit / PR: 依README commit／push工作分支；尚未PR／merge／Production部署。[接續點](../.scratch/20261012-S2-github-cloud-backup/handoff.md)。

- 整合驗收：unit 198、E2E 116 全通過；S4／S5 獨立 Audit PASS。正式雲端 CRUD 未以合成資料測試。
