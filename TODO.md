# TODO

本文件只保存跨任務 backlog 的優先順序與正式 Ticket 連結。Requirement、Authority、Acceptance、證據與目前狀態以 `tickets/*.md` 為唯一正本；`.scratch/<task>/handoff.md` 只保存需要跨環境接續的最新快照。

固定格式：`- [ ] <摘要> — Ticket: [<id>](tickets/<file>.md)`。不在此處複製 Acceptance、執行紀錄或證據。

項目只能存在於一個區段；優先順序或阻塞分類改變時移動項目。完成後移除該項，完成證據留在正式 Ticket，必要的使用者可見變更寫入 `CHANGELOG.md`。

## Now

<!-- 目前優先處理的 backlog。 -->
- [ ] V1 本機優先計算器（不含 Supabase） — Ticket: [20261008-v1-local-first-app](tickets/20261008-v1-local-first-app.md)

## Next

<!-- 已確認但尚未開始的 backlog。 -->

## Blocked

<!-- 需要外部資料、決策或環境修復的 backlog；由正式 Ticket 保存阻塞原因與解除條件。 -->

完成條件：每個項目都有唯一正式 Ticket、只出現在一個區段，且沒有已完成工作或執行細節。
