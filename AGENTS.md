# 開發核心規範

<!-- Based on project-standards: <commit-or-release>. 複製後由目前專案版本負責實際執行。 -->

本文件是目前專案永遠載入的 AI 工程底線，只寫模型無法自行推得的專案邊界。Orchestrator 負責決策、協調與驗收，`luna_worker` 依分級負責受委派的明確施工；角色與模型以 README 為準。更接近目標檔案的 scoped `AGENTS.md` 可以增加限制，或以具備相同保障效果的流程取代細節，但不得降低正確性、資料安全、可接續性與驗證要求。

## 1. 溝通

以繁體中文（台灣用語）回覆，除非使用者另有指定。區分已驗證、推論與未執行；版本、模型等易變資訊優先查官方來源。只在答案會實質改變結果時提問，並繼續不依賴答案的已授權工作。

## 2. 授權與 Scope

- `tickets/*.md` 是唯一正式 Work Authority；只有 Owner 在目前 Session 明確授權的 L1 工作可以沒有 Ticket。身份依 [Ticket Convention](tickets/README.md#身份繼承與核准依據)繼承，繼承不等於批准新 Scope 或外部發布。
- 明確的修改／修復請求就是該 Scope 的施工授權：完成實作、驗證並修正本次造成的問題，可逆細節自行決定。只有需要新決策、新權限或無法取得驗收證據的部分才暫停，其餘繼續。
- 破壞性操作須有明確授權與目標。
- Git standing authorization 以 README 為正本，任務特定 Git／Remote 權限以目前 Ticket 為正本；依兩者 commit／push 已核准且驗證通過的更新。PR、merge、deploy 與其他外部發布須另行授權。
- 新增依賴、外部服務、API 契約、快取或抽象前，必須有需求、Ticket 或既有設計依據。

## 3. 工程底線

- 不猜測 API、Schema、Type、UI 行為、安全要求或業務規則；不明時暫停受影響部分並記錄。
- 只做 Scope 需要的外科手術式修改，選擇滿足需求與驗證的最簡單正確解法；清理自身變更產生的 unused code，保留既有且無關的 dead code。
- 規範無法同時滿足時停止修改並記錄衝突；同一路徑連續三次修復失敗後停止並重評假設。
- scoped 規則採等價控制時，記錄理由、證據保存位置與驗收方式。

## 4. 文件責任

- `README.md`：專案目的、Owner、快速開始、角色與模型、架構導覽、驗證入口與文件索引。
- `docs/API.md`、`docs/UI.md`、`docs/CONTEXT.md` 與 `docs/adr/`：只在對應契約或決策存在時建立和更新。
- `TODO.md` 只保存 `Now／Next／Blocked` backlog 索引；`CHANGELOG.md` 保存有意義的使用者可見變更；兩者不取代契約或 Work Authority。
- `.scratch/<task>/handoff.md` 只保存未完成任務的接續快照。需要跨 Session／裝置接續時依 [Git handoff](docs/HANDOFF.md) commit、push 並核對遠端；無法可靠同步時標記 `blocked`。已有 handoff 的任務在最終 commit 前改為 `done`；沒有 handoff 的完成任務不補建。

## 5. 條件式路由

只在觸發時讀取對應文件；純文件小修與原因明確的局部修正直接依 Scope 執行與驗證。

- 行為變更、跨模組或未知原因除錯：[工程方法](docs/development/ai-development-guide.md)。
- 接手進行中的 `.scratch/<task>/`：[Handoff](docs/HANDOFF.md)；多個候選任務時先確認目標。
- 建立 Ticket 或判斷授權：[Work Authority](docs/agents/work-authority.md)與 [Ticket Convention](tickets/README.md)。
- 建立 Domain 語彙、CONTEXT 或 ADR：[Domain Docs](docs/agents/domain.md)。
- 需要 Skill 工作流：先讀 [Skill 適配](docs/agents/skill-workflows.md)。規格拆票／多步驟施工用 `to-tickets`／`implement`；原因未知或反覆失敗的除錯用 `diagnosing-bugs`；有可執行測試 seam 的行為變更用 `tdd`；重大歧義需保存決策用 `grill-with-docs`；明確的簡化或依賴取捨用 `ponytail`。
- 準備交付：[Review 規範](docs/agents/review.md)，依風險選擇 review 深度。
- 準備委派：[Subagent 規則](docs/SUBAGENTS.md)，依 README 角色表為每個工作單位選擇 Luna Low／Medium／Max，並確認實際入口的模型與推理設定。
- L2／L3、Owner 正式核准、多人施工或獨立稽核：[AI 治理規範](docs/governance/ai-governance.md)。

## 6. 驗證與完成

- `README.md` 或 scoped `AGENTS.md` 必須提供實際存在變更類型的驗證入口。
- 從最接近變更的檢查開始，依影響範圍與風險擴大；已通過且沒有新變更或疑慮的檢查不重跑。
- 無法執行首選驗證時，記錄原因、替代驗證與未驗證風險；未執行不得記為通過。

完成條件：Acceptance 已滿足且有可重現證據，剩餘風險已明示，既有 handoff 已結案，完成更新已 commit／push。

## 7. 工具與模型

Agent 設定、steering 或 fileMatch 只負責角色與路由，並指向本文件與適用的 `docs/`；不維護第二份完整規範。模型版本與推理設定由目前環境或 `.codex/agents/` profile 決定，OpenAI 模型選用見 [模型設定](docs/agents/models.md)；本文件不自動切換模型，底線適用於所有模型。
