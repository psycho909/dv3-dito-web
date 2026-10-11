# TODO

本文件只保存跨任務 backlog 的優先順序與正式 Ticket 連結。Requirement、Authority、Acceptance、證據與目前狀態以 `tickets/*.md` 為唯一正本；`.scratch/<task>/handoff.md` 只保存需要跨環境接續的最新快照。

固定格式：`- [ ] <摘要> — Ticket: [<id>](tickets/<file>.md)`。不在此處複製 Acceptance、執行紀錄或證據。

項目只能存在於一個區段；優先順序或阻塞分類改變時移動項目。完成後移除該項，完成證據留在正式 Ticket，必要的使用者可見變更寫入 `CHANGELOG.md`。

## Now

<!-- 目前優先處理的 backlog。 -->
- [ ] 遊戲待確認規則實測（Owner 實地觀察，可與開發平行） — Ticket: [20261008-game-rule-observation](tickets/20261008-game-rule-observation.md)

## Next

<!-- 已確認但尚未開始的 backlog。依序排列；括號內為 blocking edges。 -->

## Blocked

<!-- 需要外部資料、決策或環境修復的 backlog；由正式 Ticket 保存阻塞原因與解除條件。 -->
- [ ] S1 Supabase 資料表、RLS、RPC 與 pgTAP（正式專案已指定；待 L3 核准、隔離驗證環境） — Ticket: [20261008-S1-supabase-schema-rls](tickets/20261008-S1-supabase-schema-rls.md)
- [ ] S2 匿名雲端備份與離線佇列（S1、12；需 Turnstile key） — Ticket: [20261008-S2-anonymous-backup-queue](tickets/20261008-S2-anonymous-backup-queue.md)
- [ ] S3 Email 連結與跨裝置恢復（S2） — Ticket: [20261008-S3-email-link-restore](tickets/20261008-S3-email-link-restore.md)
- [ ] S4 雲端版本衝突處理（S2） — Ticket: [20261008-S4-version-conflict](tickets/20261008-S4-version-conflict.md)
- [ ] S5 雲端刪除與登出保護（S2） — Ticket: [20261008-S5-cloud-delete-signout](tickets/20261008-S5-cloud-delete-signout.md)
- [ ] D2 Vercel 部署雲端版（D1、S3、S4、S5；需正式 Supabase 專案） — Ticket: [20261008-D2-vercel-cloud-deploy](tickets/20261008-D2-vercel-cloud-deploy.md)

完成條件：每個項目都有唯一正式 Ticket、只出現在一個區段，且沒有已完成工作或執行細節。
