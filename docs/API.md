# Supabase 記牌資料契約

S1 提供資料庫契約；S2 已實作 GitHub 登入後自選啟用備份的前端，發布／驗收狀態見 S2 Ticket。專案 `lcsyotvievikernvhquj`，兩表只允許 `authenticated` 讀取自己的列，禁止直接寫表；UID 一律取自 `auth.uid()`，RPC 不接受 user_id。前端每次請求綁定已驗證的原帳號 access token（僅記憶體），避免身分切換期間把原資料送到新 UID。

本機 session 與有序 mutation queue 以同一 localStorage setItem 保存。每個批次固定 expectedRevision／mutationId／events／快照，逾時重送不更換 ID；成功只移除已確認的 head，後續新輸入保留。登入不自動啟用；首次上傳或空裝置下載皆須摘要及確認，兩端皆有紀錄則停止並保留兩端，完整選版屬 S4。未確認上傳、離線、錯誤或衝突不得顯示已備份。Client codec 驗證快照；事件由成功 reducer action 及當時狀態產生，包含 finalScore/tier/remainingAfter、toolRemaining/matched、previousRemaining 與頂層 correction boundaryChanges。

## commit_forge_state

參數：`p_expected_revision`（非負安全整數）、`p_mutation_id`（UUID）、`p_state`（schemaVersion=1 的 PersistedSession JSON object）、`p_actions`（1～200 筆事件）、`p_revive_deleted=false`。

state 與 actions 各自限制 PostgreSQL JSONB 轉文字後 UTF-8 大小 ≤ 524288 bytes。事件必須含 UUID eventId、有效標準 UTC at（毫秒）、規格 ForgeActionType 的 type 與 payload 欄位；payload 為規格定義的 unknown，詳細 domain／引用／各類事件內容驗證由客戶端既有 session codec 及 reducer 負責，SQL 不計算機率。完整 LocalEnvelope、認證資訊與推導值不得上傳。

- 成功／相同 mutation 重送：`{status: "COMMITTED", revision: n}`。重送回原提交的 revision，未必是伺服器目前最新 revision；客戶端須再讀取自己的 state 核對。
- revision 不符：`{status: "VERSION_CONFLICT", revision: n}`，不改寫資料。
- 刪除墓碑且未明確重新啟用：`{status: "DATA_DELETED", revision: n}`。
- 無 UID：SQLSTATE `42501`／`AUTH_REQUIRED`。
- 參數、格式、大小或事件類型不合法：SQLSTATE `22023`／`INVALID_REQUEST`、`INVALID_STATE`、`INVALID_ACTIONS`。
- 同 mutation ID 使用不同 revision、state、actions 或 revive 旗標：SQLSTATE `22023`／`MUTATION_ID_REUSED`。

首次提交 expectedRevision=0。每 UID 使用交易 advisory lock，涵蓋沒有 state row 時的首次競爭；快照、revision 和 mutation 同交易保存。SHA-256 request_hash 保存完整請求的指紋，避免為冪等再保存一份遊戲歷史。

## delete_forge_data

參數：`p_expected_revision`。成功回 `{status: "DELETED", revision: n}`；刪除 mutation log、清空 state，revision+1 並保留 UID／刪除時間墓碑。revision 不符回 VERSION_CONFLICT。已刪除且提交目前 revision 時回同一結果。

刪除回應遺失時，客戶端需重讀墓碑後核對，不可把舊 revision 的 conflict 當成刪除失敗。重新啟用須由使用者明確確認，以墓碑最新 revision、新 mutation ID、`p_revive_deleted=true` 提交。未連線不得顯示刪除成功。
