# Work Authority Convention

## 唯一正本

本專案唯一 Work Authority 是 Git 追蹤的 `tickets/*.md`；固定格式與生命週期見 [`tickets/README.md`](../../tickets/README.md)。GitHub Issues、其他 tracker、PR、commit、聊天與 `.scratch` 只能保存討論、證據或接續狀態，不得維護第二份目前狀態正本。

`TODO.md` 只索引未完成 backlog，不複製 Authority 的最新內容。

## 何時需要正式 Ticket

- L1、單一 Session、低風險且可逆的工作，可以由 README 允許的當前 Owner 明確請求直接授權。
- backlog、跨 Session／裝置、多人或多 Agent 工作必須有正式 Ticket。
- L2／L3、公開契約、安全、敏感資料、production 或破壞性操作必須有正式 Ticket 與可追溯核准。

## Ticket 最小契約

正式 Ticket 使用 `tickets/README.md` 的固定格式，至少記錄 Goal、Scope、Out of Scope、Acceptance、Risk、Git／Remote authority、Owner／Approver、dependencies、blockers 與 Evidence。

身份繼承及核准依據以 [Ticket Convention](../../tickets/README.md#身份繼承與核准依據)為正本；Agent 沿用 README 的一次性身份，記錄已取得的 Scope 授權，不要求使用者重填欄位或重複回覆批准。

施工前必須能辨識已核准的 Scope 與核准來源。新增或擴張 Scope 需要對應授權；使用者已明確指派時直接記錄該指示，不再詢問同一授權。草案、身份繼承與先前其他任務的批准都不能替代本次授權。

## 狀態與證據

正式流程使用 draft、approved、in_progress、returned、blocked、accepted 與 archived；狀態改變時更新目前原因與證據位置，不附加逐回合日誌。

有正式 Ticket 時，PR、commit、Audit Report 與 handoff 必須反向連結該 Ticket。README 允許的無 Ticket L1 工作在回報保存當前授權及證據，不為反向連結補建 Ticket。Ticket 改為 `accepted` 前，Acceptance 與剩餘風險必須具有可重現證據；review 範圍與 fallback 見 [Review 規範](review.md)。
