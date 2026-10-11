# Supabase 記牌資料契約

S1 提供資料庫契約；S2 已實作 GitHub 登入後自選啟用備份的前端，發布／驗收狀態見 S2 Ticket。專案 `lcsyotvievikernvhquj`，兩表只允許 `authenticated` 讀取自己的列，禁止直接寫表；UID 一律取自 `auth.uid()`，RPC 不接受 user_id。前端每次請求綁定已驗證的原帳號 access token（僅記憶體），避免身分切換期間把原資料送到新 UID。

本機 session 與有序 mutation queue 以同一 localStorage setItem 保存。每個批次固定 expectedRevision／mutationId／events／快照，逾時重送不更換 ID；成功只移除已確認的 head，後續新輸入保留。登入不自動啟用；首次上傳或空裝置下載皆須摘要及確認，兩端皆有紀錄則停止並保留兩端，選版流程見下節。未確認上傳、離線、錯誤或衝突不得顯示已備份。Client codec 驗證快照；事件由成功 reducer action 及當時狀態產生，包含 finalScore/tier/remainingAfter、toolRemaining/matched、previousRemaining 與頂層 correction boundaryChanges。

## 衝突與本機生命週期（S4／S5）

比較本機／雲端局數、週期、手牌、最後變更／刪除時間。先下載兩端與待送封存檔，再明確確認保留本機或雲端；最新 revision 或本機已變動時要求重新比較與匯出，不以時間決定勝負。

以本機覆蓋將固定新 mutation ID、最新 revision、快照及 coveredMutationCount 存入 LocalEnvelope.conflictResolution，原佇列保持不動；重整／逾時重送同一計畫。ACK 後才移除已覆蓋的舊批次，計畫之後新增且未送出的批次保留並依新 revision 重排。Auth token 僅在 SDK／請求記憶體，不進 envelope 或封存檔。

封存檔 format=dito-conflict-backup-v1，包含 localEnvelope（含 queue）及 cloud.state。不能直接一般匯入；需取出 localEnvelope.session 或 cloud.state 另存 JSON，再使用現有備份匯入。queue 僅供完整原始證據／復原，不自動回灌。

刪除需線上讀取目標 revision、確認後呼叫 delete_forge_data，收到 DELETED 才清本機；失敗／衝突保留原資料，ACK 後本機清除失敗則明示雲端已刪、本機仍留。刪除中禁止輸入並阻止同步競跑；有 pending／未確認覆蓋計畫或雲端操作進行中禁止登出。墓碑後重新啟用須確認、備份原資料，以全新週期及 reviveDeleted=true 提交，ACK 前不取代舊本機歷史。

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
