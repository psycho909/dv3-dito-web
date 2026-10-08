# <Project Name>

<!-- Based on project-standards: <commit-or-release>. 複製後請完成所有必要欄位。 -->

## 目的

<!-- 說明專案解決的問題、主要使用者與 Scope。 -->

## 快速開始

### 前置需求

<!-- 列出必要的 runtime、工具與版本。 -->

### 安裝與執行

<!-- 寫入可直接執行的安裝與啟動命令。 -->

## Work Authority 與 Git handoff

- Work Authority：Git 追蹤的 [`tickets/*.md`](tickets/README.md)
- Owner：User（2026-10-08 於 Kiro Session 確認）
- Approver：同 Owner；只有不同核准者或任務特定授權時才另行指定。
- L1 單一 Session 直接授權：allowed；限 Owner 在目前 Session 明確指定、低風險且可逆的工作
- Git commit／push：已核准且驗證通過的更新，預先授權 push 到目前工作分支；受保護分支與 PR 流程仍依 repository 規則。
- `.scratch` 持久化：未完成且需要跨環境接續時保存於工作分支；完成後將長期證據移回正式正本，並依專案政策保留或清理。

Owner 在初始化時確認一次；後續身份未變不重填、不重問。若 Owner 已在目前 Session 明確確認自己的專案責任，Agent 可據此補齊 README，後續 Ticket 的繼承與核准來源以 [Ticket Convention](tickets/README.md#身份繼承與核准依據)為正本。尚未確認身份時不推測核准者；可以繼續唯讀分析與其他不需要該授權的工作，只阻塞需要核准的部分。

正式 Ticket 的觸發條件與最小契約見 [Work Authority Convention](docs/agents/work-authority.md)。跨 Session／裝置接續必須依 [Handoff Workflow](docs/HANDOFF.md) commit、push、pull 並核對遠端 commit。

## 角色與模型

| 角色 | 模型／effort | 固定顯示名稱 | 權責 |
| --- | --- | --- | --- |
| Orchestrator／Final Reviewer | GPT-6.1 Sol／medium（專案路由目標） | `g61-sol-med-orchestrator` | Spec、產品與架構決策、委派、整合及最終 Gate；實際 Session 身份依可觀測 runtime 資訊記錄 |
| Luna Low | `gpt-5.6-luna`／low | `g6-luna-low-explorer`、`g6-luna-low-content-worker`、`g6-luna-low-qa-runner` | 機械探索、資料／內容建立、QA 執行與長時間 runner |
| Luna Medium | `gpt-5.6-luna`／medium | `g6-luna-med-engineer`、`g6-luna-med-bug-fixer`、`g6-luna-med-reviewer` | 一般 feature／bug fix、測試設計、局部重構與一般 review |
| Luna Max | `gpt-5.6-luna`／max | `g6-luna-max-core-engineer`、`g6-luna-max-bug-fixer`、`g6-luna-max-deep-reviewer` | 僅複雜核心／跨模組、Save／Migration／Determinism／Race 與深度 review |

> 目前開發環境為 Kiro IDE，沒有 GPT-6 Luna；三個 Luna 分級一律使用模型 ID `gpt-5.6-luna`，以 effort（low／medium／max）區分。委派時必須在 workflow step 明確設定 `modelId` 與 `effortLevel`，不可省略後沿用主 Session 模型。固定顯示名稱沿用原值，不代表 runtime 模型。
| Independent Auditor | 未參與施工的獨立 context；依路由規則與工具能力選擇 | 依工作選用符合實際 effort 的 reviewer | 必要獨立稽核；L3 最終授權仍屬人類 Owner |

直接選一次可可靠完成工作的最低成本角色，整體成本包含重試與升級；不採固定 Low→Medium→Max→Sol pipeline，不先把明顯屬於 Medium／Max 的任務交給 Low，也不重做 Subagent 已可靠完成的工作。一般 bug 的修復由 Medium 負責；只有較低成本的合理嘗試已證明不足或確認核心／高風險時才升級。分級路由、升級條件與委派契約見 [Subagents](docs/SUBAGENTS.md#3-分級路由)；一般 L1／L2 review 的執行者與 fallback 見 [Review 規範](docs/agents/review.md)。工具 task name 轉換不得改變 requested model／effort／role；task name 不代表 runtime 身份。切換主 Agent 模型不改變 Ticket、安全與 Git 權限。

Skill 首選來源與適配見 [Skill Workflows](docs/agents/skill-workflows.md)；若專案另選來源，在此記錄完整 Skill 名稱與理由，避免僅寫短名稱造成不同裝置選到不同流程。

主 Agent 的 GPT-6.1 Sol 模型 ID、推理設定、官方來源與證據邊界見 [模型設定](docs/agents/models.md)，只在設定或核對模型時讀取。

## 驗證

<!-- 保留實際存在的變更類型；不適用時標記 N/A。 -->

| 變更類型 | 首選驗證 | 替代驗證或限制 |
| --- | --- | --- |
| 文件 | <!-- command --> | <!-- fallback --> |
| 程式模組 | <!-- command --> | <!-- fallback --> |
| API | <!-- command / N/A --> | <!-- fallback --> |
| UI | <!-- command / N/A --> | <!-- fallback --> |
| 資料遷移 | <!-- command / N/A --> | <!-- fallback --> |
| 設定 | <!-- command / N/A --> | <!-- fallback --> |

每個實際存在的驗證入口須填寫工作目錄／命令、成功判準及必要環境；fallback 要說明不能證明的部分。若測試使用可丟棄 fixtures、無正式資料或外部副作用，可明確列為已授權的可重複執行檢查；未確認的安全條件不得先填為事實。驗證失敗先區分既有問題與本次回歸，必要證據無法取得時依 AGENTS 記錄阻塞。

## 三層 AI 規範

```text
AGENTS.md
  └─ 永遠載入：角色責任、工程底線、驗證與 workflow 路由
      ├─ 行為變更／跨模組／未知原因除錯 → docs/development/ai-development-guide.md
      ├─ 選擇 Skill／準備交付 → docs/agents/skill-workflows.md／review.md
      ├─ 多人／授權／風險／Audit → docs/governance/ai-governance.md
      ├─ 未完成任務接續 → docs/HANDOFF.md
      └─ 準備委派工作 → docs/SUBAGENTS.md
```

根規範保持精簡；條件式文件只在觸發對應流程時載入。Scoped `AGENTS.md` 可增加專案或技術棧限制，但不得降低根規範底線。

## 啟用設定檔

以協作複雜度與風險選擇最小設定檔；專案大小只作參考。任何 L3 工作即使位於微型專案，也必須升級採用中大型設定檔的治理與 Audit。

| 設定檔 | 適用情況 | 固定啟用 | 條件式啟用 |
| --- | --- | --- | --- |
| **微型** | 單一工具、prototype、一次性腳本；單一 Agent；以 L1 為主 | `AGENTS.md`、README 必要契約、最接近變更的驗證 | 行為工作讀取 Development Guide；backlog 或跨 Session 工作建立 Ticket；需要接續才建立 `.scratch` |
| **小型** | 持續維護的應用；存在 API、UI 或多模組；以 L1–L2 為主 | Root＋適用 scoped 規則、README 必要契約、相稱驗證 | 行為工作讀取 Development Guide 與受影響 API／UI 契約；正式工作讀目前 Ticket；委派／跨環境才讀 Subagents／Handoff；L2 依風險 Audit |
| **中大型** | 多服務、多團隊、敏感資料、production 或 L3 工作 | Root＋適用 scoped 規則、README 必要契約、相稱驗證 | 依任務觸發 Development Guide、Governance、Ticket、整合驗證；多 Agent／跨環境讀相應文件；L3 必須 Independent Audit 與 Owner 核准 |

設定檔只決定預設載入範圍，不降低 Root 的正確性、安全性、Scope 與驗證底線。條件未觸發時不預建空目錄、空契約或儀式性 Report。

選擇大型專案設定檔不代表每次錯字修正都讀取全套文件；以本次風險與受影響範圍決定。Root、scoped 與 README 的適用指示仍須掌握；不能用小任務分類避開正式 Ticket 或 L3 條件。

## 架構導覽

<!-- 說明實際存在的主要目錄、模組責任與重要資料流。 -->

固定使用 `tickets/` 保存 Work Authority。條件式目錄按需求建立：`docs/CONTEXT.md` 保存共享 Domain／架構語彙；`docs/adr/` 保存重大且難逆轉的決策；`reports/audit/` 只在觸發 Independent Audit 時建立；`.scratch/<task>/` 只保存未完成任務。

## 文件索引

- [AGENTS.md](AGENTS.md)：跨專案工程底線與條件式流程入口
- [AI Development Guide](docs/development/ai-development-guide.md)：Ponytail、Surgical Changes、Debugging、TDD 與 Silent DoD
- [AI Governance](docs/governance/ai-governance.md)：角色、Authority、風險、Audit 與 Acceptance
- [Work Authority](docs/agents/work-authority.md)／[Ticket Convention](tickets/README.md)／[Domain Docs](docs/agents/domain.md)：工作正本、固定格式與 Domain 文件位置
- [Skill Workflows](docs/agents/skill-workflows.md)／[Review](docs/agents/review.md)：來源適配、審查範圍及失敗處理
- [模型設定](docs/agents/models.md)：OpenAI 主 Agent 模型 ID、推理設定與官方來源
- [Handoff](docs/HANDOFF.md)：未完成任務跨環境接續
- [Subagents](docs/SUBAGENTS.md)：委派契約、邊界與整合驗收
- [TODO.md](TODO.md)／[CHANGELOG.md](CHANGELOG.md)：backlog 與已完成的重要變更

API 或 UI 契約實際存在時，從 project-standards 上游的 `templates/optional/docs/` 複製對應模板到 `docs/`，再加入本索引。
