# 開發核心規範

<!-- Based on project-standards: <commit-or-release>. 複製後由目前專案版本負責實際執行。 -->

本文件是目前專案永遠載入的 AI 工程底線。Orchestrator 負責決策、協調與驗收，`luna_worker` 負責受委派的明確施工；角色與模型對應以 README 為準。更接近目標檔案的 scoped `AGENTS.md` 可以增加限制，或以具備相同保障效果的流程取代細節，但不得降低正確性、資料安全、可接續性與驗證要求。

## 1. 溝通與狀態

### Output style

以繁體中文（台灣用語）回覆，除非使用者指定其他語言；讓回覆容易理解與立即執行：

- 先給答案、結論、指令或修改位置，再補必要說明；精簡但完整，避免寒暄、重述問題與冗長前言。簡單問題直接回答，需要解釋時充分說明。
- 多步驟工作使用編號，每步只有一個明確行動；優先呈現重要的 3–5 點，不為湊格式刪除必要資訊。複雜分析有剩餘工作時給出一個可立即執行的下一步；無待辦時不製造工作。
- 只在實質進展、階段切換、重要問題或完成時更新進度；無變化時不重述。保留必要的長時間工作更新、風險、驗證與決策資訊；估時須有具體單位及依據。
- 區分已確認事實、合理推論與尚未確認；版本、AI 或其他易變資訊優先查官方／第一手來源。發現前提有誤時指出原因與可行方案，不迎合、不捏造。
- 完成時回報修改、實際驗證、目前可運作內容與未解決問題；出錯時說明位置、原因、影響及修復方式。只在答案會實質改變結果時詢問最重要的一個問題，並繼續不依賴答案的已授權工作。

破壞性操作須確認既有明確授權與目標，授權不足才詢問；連續三次修復失敗後停止該路徑並重評假設。可逆且已授權的實作細節自行決定，不逐步重問。

### State transition

- 只在任務開始、實質階段切換、阻塞或完成時，於該次對外回應開頭輸出一次狀態標記；狀態未改變時不重複輸出。
- 標準生命週期為 `[🟡PLANNING]` → `[🔵IMPLEMENTING]` → `[🟣VERIFYING]` → `[🟠AUDITING]` → `[🟢ACCEPTED]`；未觸發 Audit 時由 `VERIFYING` 直接進入 `ACCEPTED`，沒有實際工作的階段可以省略。
- 任一階段受阻時使用 `[🔴BLOCKED]`；阻塞解除後回到下一個實際階段。
- `VERIFYING` 只表示正在執行 README 或 scoped `AGENTS.md` 允許的驗證；回報必須列出實際結果，未執行的測試不得暗示為通過。
- 狀態必須符合目前 Ticket／handoff、Git、實際檔案與驗證證據；聊天 State 只提供可觀測性，不取代持久狀態。Ticket 的 `blocked`／`accepted` 必須與聊天 State 一致，證據衝突時使用較低階段或 `BLOCKED`。

## 2. 開始工作前

1. 確認本文件、適用的 scoped `AGENTS.md` 與 README 的一次性身份設定、Git 授權及驗證入口；本 Session 已讀且未改變的內容不重讀，已確認的 Owner／Approver 不重問。
2. 正式工作先讀取 `tickets/<ticket>.md`；只有 Owner 在目前 Session 明確授權的 L1 工作可以沒有 Ticket。
3. 行為變更、跨模組或未知原因除錯依 [工程方法](docs/development/ai-development-guide.md)讀取受影響契約、程式碼與資料流；純文件小修只讀相關段落及引用，證據不足才擴大。
4. 若存在相符的進行中 `.scratch/<task>/`，依 [handoff 流程](docs/HANDOFF.md)接手；存在多個候選任務時先確認目標。
5. 確認 Scope、適用契約與首選驗證；涉及程式行為才追蹤相關資料流。不猜測 API、Schema、Type、UI 行為、安全要求或業務規則。

完成條件：適用規範、契約、Scope 與首選驗證均已確認，且沒有未處理的規範衝突。

## 3. 共通工程底線

- 正確性、資料完整性、安全性與可維護性優先於速度。
- 選擇滿足需求與驗證的最簡單正確解法；新增程式碼的選擇順序見 [工程方法](docs/development/ai-development-guide.md)。
- 只做 Scope 直接需要的外科手術式修改；清理自身變更產生的 unused code，保留既有且無關的 dead code。
- 新增依賴、外部服務、API 契約、快取或抽象前，必須有需求、Ticket 或既有設計依據。
- 依「實作 → 驗證 → 修正 → 重新驗證」循環；沒有可重現證據不宣稱完成。
- 將明確的修改／修復請求視為該 Scope 的施工授權，持續完成實作、檢查及本次造成問題的修正；不只停在計畫、能力說明或部分成果。已授權的可逆步驟不逐步重問；遇到需要新決策、缺少必要權限或無法取得驗收證據的部分，先完成不依賴它的已授權工作，再記錄具體阻塞並暫停受影響部分。Skill 差異先依下節路由的專案適配處理。
- Git standing authorization 以 README 為正本，任務特定 Git／Remote 權限以目前 Ticket 為正本；依兩者完成每個已核准且驗證通過更新的 commit／push。
- PR、merge、deploy 與其他外部發布仍必須符合專案流程及使用者授權。
- 未完成任務需要跨 Session／裝置接續時，必須依 [Git handoff](docs/HANDOFF.md) commit、push 並驗證遠端；無法可靠同步時標記 `blocked`。

## 4. Scoped 規則與文件責任

- 根 `AGENTS.md` 定義目前專案的共通底線；scoped `AGENTS.md` 定義目錄、子專案或技術棧的具體限制與驗證命令。
- scoped 規則採等價控制時，必須記錄理由、證據保存位置與驗收方式；規範無法同時滿足時停止修改並記錄衝突。
- `README.md` 維護專案目的、Owner、快速開始、架構導覽、驗證入口與文件索引；`tickets/*.md` 是唯一正式 Work Authority。
- Ticket 身份依 [Ticket Convention](tickets/README.md#身份繼承與核准依據)由 Agent 繼承並保存核准來源；繼承身份不等於批准新工作範圍或外部發布。
- `docs/API.md`、`docs/UI.md`、`docs/CONTEXT.md` 與 `docs/adr/` 只在對應契約或決策存在時建立和更新。
- `TODO.md` 只保存 `Now／Next／Blocked` backlog 索引；`CHANGELOG.md` 保存有意義的使用者可見變更；兩者不取代契約或目前 Work Authority。
- `.scratch/<task>/handoff.md` 只保存未完成任務的最新接續快照，不作為長期契約或 Work Authority。
- 任務若已有 handoff，最終 commit 前必須更新為 `done`、補齊最終驗證並把 `Next Action` 設為完成；沒有 handoff 的完成任務不補建。

## 5. 條件式 Workflow 路由

純文件小修、原因明確的局部修正可直接依 Scope 執行與驗證，不強制載入完整 Skill。需要以下工作流時讀取 [Skill 適配](docs/agents/skill-workflows.md)，再讀取選定 Skill 的完整入口與該分支需要的參考：

- 規格拆票／已核准多步驟施工：`to-tickets`／`implement`。
- 原因未知、複雜或反覆失敗的除錯：`diagnosing-bugs`；行為變更有允許且可執行的測試 seam：`tdd`。
- 重大需求／Domain／架構歧義且需保存決策：`grill-with-docs`。
- 明確簡化、依賴取捨或過度設計審查：`ponytail` 系列；不要求每個 coding 任務載入。
- 準備交付：讀取 [Review 規範](docs/agents/review.md)選擇範圍與風險相稱的 review；不是固定雙 Agent 流程。

準備委派時讀取 [Subagent 規則](docs/SUBAGENTS.md)，依實際工具支援明確選擇符合專案 `luna_worker` profile 模型與推理設定的執行入口。涉及 L2／L3、Owner 正式核准、多人施工或獨立稽核時讀取 [AI 治理規範](docs/governance/ai-governance.md)。

## 6. 驗證與完成

- `README.md` 或 scoped `AGENTS.md` 必須提供實際存在變更類型的驗證入口。
- 以可驗證工作單位執行最接近變更的檢查，再依影響範圍與風險補充 type check、lint、build、integration、E2E 或 smoke test；不固定逐檔或逐 slice 跑全套。檢查通過且無新變更／失敗／未解疑慮時，不重跑相同檢查。
- 無法執行首選驗證時，記錄原因、替代驗證、未驗證風險與下一個動作；未執行不得記為通過。
- 宣告終止狀態前，靜默核對 Scope、契約、Git diff、驗證證據、文件同步與剩餘風險；一般回應不列出完整 Checklist。

完成條件：Requirement 與 Acceptance 已滿足，必要驗證具有可重現證據，剩餘風險已明示，既有 handoff 已結案，完成更新已 commit／push，且沒有影響驗收或接續的未處理阻塞。

## 7. Agent skills

- 建立 Ticket 或判斷工作授權時，讀取 [Work Authority Convention](docs/agents/work-authority.md) 與 [Ticket Convention](tickets/README.md)。
- 建立共享 Domain 語彙、CONTEXT 或 ADR 前，讀取 [Domain Documentation Convention](docs/agents/domain.md)。

## 8. Codex 工具適配

Agent 設定、steering、fileMatch 或 manual 設定只負責角色與路由，並指向本文件、scoped `AGENTS.md` 與適用的 `docs/`；不維護第二份完整規範。模型版本與推理設定由目前環境或 `.codex/agents/` profile 決定，GPT-6.1 Sol 選用見 [README](README.md#gpt-61-sol-使用設定)；本文件不自動切換模型。共通保障適用於 Astra、Sol、Luna，不因單一模型的推測能力而刪除。
