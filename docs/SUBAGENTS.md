# Subagent Delegation

本文件只在準備委派工作時載入。主 Agent 由目前 Session 選擇；subagent 的角色、模型與推理設定以 [README 角色與模型](../README.md#角色與模型)為唯一正本，本文件只定義委派流程與分級路由規則。

## 1. 責任

- **Orchestrator：** 負責需求澄清、風險判斷、拆分、整合、最終驗證與 Acceptance 建議。
- **`luna_worker`／Developer：** 依 README 選定的 Luna 分級角色，處理 Scope、限制及驗收條件已確定的工作單位，並回報實際修改與證據。

## 2. 是否委派

工作可拆成獨立驗收、寫入範圍互不重疊且每單位只有一個 owner 時才平行委派。需求歧義、架構或安全取捨、破壞性操作、權限擴張、外部發布，以及協調成本高於直接施工的工作，由 Orchestrator 先處理。

## 3. 分級路由

依 README 角色表，為每個工作單位直接選擇一次可可靠完成的最低成本角色；整體成本包含重試與升級：

| 分級 | 典型工作 |
| --- | --- |
| Luna Low | 機械探索、檔案搜尋、資料／內容建立、Log 分類、QA 執行與長時間 runner |
| Luna Medium | 一般 feature／bug fix、測試設計、局部重構與一般 review |
| Luna Max | 複雜核心／跨模組、Save／Migration／Determinism／Race 與深度 review |

- 不採固定 Low→Medium→Max→Sol pipeline；明顯屬於 Medium／Max 的工作不先交給 Low，Subagent 已可靠完成的工作不重做。
- 只有較低分級的合理嘗試已證明不足，或確認屬於核心／高風險工作時才升級；升級時記錄原因。
- 不設定全域 Luna 預設，也不因外部 Skill 預設改派其他模型；每次委派依工作責任明確選擇分級。
- 委派前確認工具實際綁定的模型與推理設定。若專案 profile 或內建角色與選定分級不符，使用可指定模型的 `worker` 明確設定 README 所列模型／effort，並要求它遵守專案 profile 的 `developer_instructions` 與本文件委派契約。省略 agent type、只改 TOML 或只看 task name，都不能證明已使用選定分級；回報實際入口與設定。
- 架構／產品／安全決策與最終驗收由主 Agent 負責；必要 Independent Audit 不可由施工者替代，須由未參與施工的獨立 context 執行。

## 4. 委派契約

每次委派必須包含：

- 選定分級、實際 agent type、模型與推理設定；採 `worker` 覆寫時記錄採用原因。
- 目標、允許修改範圍與單一 owner。
- 禁止事項、已確認契約與依賴。
- Acceptance、驗證方式與必要證據。
- 預期輸出、回報格式與 blocking edges。

## 5. 驗收與整合

Subagent 回報不是最終結果。Orchestrator 必須檢查實際 diff 與證據、處理衝突、執行整體驗證，並把接受的結果寫回正式 Ticket、PR 或適用 handoff。

選定分級的委派入口不可用、停止或失敗時，先判斷是否需要改選其他分級；不適合改派時，Orchestrator 自行完成安全且 Scope 明確的工作，無法安全完成時記錄具體阻塞。未執行的委派不得視為完成。一般 review／必要 Independent Audit 的 fallback 以 [Review 規範](agents/review.md)為準；施工者的整合驗收不算獨立 Audit。

完成條件：每個委派單位都有單一 owner、互斥 Scope、明確分級、明確 Acceptance 與可重現驗證；Orchestrator 已獨立驗收所有接受的結果。
