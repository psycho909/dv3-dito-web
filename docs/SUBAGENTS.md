# Subagent Delegation

本文件只在準備委派工作時載入。主 Agent 由目前 Session 選擇；所有 subagent 使用專案 `.codex/agents/luna_worker.toml` 指定的 GPT-6 Luna、`max` 推理設定。

## 1. 責任

- **Orchestrator：** 負責需求澄清、風險判斷、拆分、整合、最終驗證與 Acceptance 建議。
- **`luna_worker`／Developer：** 處理 Scope、限制及驗收條件已確定的工作單位，並回報實際修改與證據。

## 2. 是否委派

工作可拆成獨立驗收、寫入範圍互不重疊且每單位只有一個 owner 時才平行委派。需求歧義、架構或安全取捨、破壞性操作、權限擴張、外部發布，以及協調成本高於直接施工的工作，由 Orchestrator 先處理。

## 3. Agent 選擇

- 搜尋、資料整理、既有測試、Log 分類、小型修改與其他 Scope 明確的日常生產工作，委派前先確認工具實際綁定的模型與推理設定。
- 內建 `luna_worker` 確實使用 GPT-6 Luna Max 時，選該角色；若它仍鎖定舊版，使用可指定模型的 `worker`，明確設為 `gpt-6-luna`／`max`，並要求它讀取並遵守專案 profile 的 `developer_instructions` 及本文件委派契約。省略 agent type 或只改 TOML 都不能證明委派已升級；回報實際入口與設定。
- 所有 subagent（包含 review／audit）固定 GPT-6 Luna Max，不因外部 Skill 預設而改派其他模型。架構／產品／安全決策與最終驗收由目前主 Agent 負責；Luna 不可用或協調成本過高時，主 Agent 可直接完成安全且明確的工作並簡述原因。必要獨立 Audit 不可由施工者替代，須等待合規的獨立 context。
- 不設定全域 Luna 預設；每次委派依工作責任明確選擇角色，避免決策與 Audit 被錯誤路由。

## 4. 委派契約

每次委派必須包含：

- 明確指定已確認為 GPT-6 Luna Max 的 agent type；若採 `worker` 模型覆寫，記錄實際模型、推理設定及採用原因。
- 目標、允許修改範圍與單一 owner。
- 禁止事項、已確認契約與依賴。
- Acceptance、驗證方式與必要證據。
- 預期輸出、回報格式與 blocking edges。

## 5. 驗收與整合

Subagent 回報不是最終結果。Orchestrator 必須檢查實際 diff 與證據、處理衝突、執行整體驗證，並把接受的結果寫回正式 Ticket、PR 或適用 handoff。

GPT-6 Luna Max 委派入口不可用、停止或失敗時，Orchestrator 自行完成安全且 Scope 明確的工作；無法安全完成時記錄具體阻塞。未執行的委派不得視為完成。一般 review／必要 Independent Audit 的 fallback 以 [Review 規範](agents/review.md)為準；施工者的整合驗收不算獨立 Audit。

完成條件：每個委派單位都有單一 owner、互斥 Scope、明確 Acceptance 與可重現驗證；Orchestrator 已獨立驗收所有接受的結果。
