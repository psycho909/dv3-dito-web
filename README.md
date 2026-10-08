# 迪特的鐵匠鋪機率計算器

## 目的

提供玩家手動記錄遊戲抽出的石頭，追蹤剩餘牌池並精確計算下一顆石頭的五級結果分布；工具不會控制遊戲，也不推算未定義的獎勵或下注收益。

## 快速開始

### 前置需求

- Node.js 22.14.0
- npm 11.11.1

### 安裝與執行

```bash
npm ci
npx playwright install chromium
npm run dev
```

`npm run preview` 可預覽 production build。ESLint 檢查正式程式與設定，排除 `.scratch` 原型及產物；Vitest 只收集 `tests/unit/**/*.test.ts`；Playwright 使用 Chromium 執行桌機及 375px 手機測試。

目前 Codex 雲端環境使用 Node 24.19.0／npm 11.9.0，已通過五項驗證。雲端執行時使用下列環境設定（本機一般不需要）：

```bash
export NPM_CONFIG_CACHE=/tmp/dv3-dito-web-npm-cache
export PLAYWRIGHT_BROWSERS_PATH=/tmp/dv3-dito-web-playwright-browsers
export FONTCONFIG_FILE=/workspace/shared/dv3-dito-fonts.conf
```

fontconfig helper 保存在雲端環境快照中，排除鎖定版 Chromium 無法讀取的系統 WOFF2 字型，讓繁中標題正常顯示；它不是應用程式資產。一般 clone 使用作業系統正常提供的字型與 Playwright browser cache。

## 目前可用功能

確認從完整 52 顆牌池開始記錄後，按點數鍵記錄遊戲已抽出的石頭。分數會自動重新判定 A 的 1／11 點，並同步顯示剩餘顆數與下一顆的五級結果分布。用罄的點數不能再輸入；牌池空時停止機率計算，不會自動補滿。

可撤銷目前尚未完成的一局最後一次輸入。完成本局前會確認；完成後鎖定手牌與最終分數。局末剩餘至少 15 顆時，開始新局沿用牌池；少於 15 顆時，下一局才依規則推定換成新 52 顆週期，局中不補滿。已完成回合及舊週期紀錄保留，不能以撤銷修改。

新週期可回答遊戲是否顯示 52 顆，也可稍後再確認。未確認前數量與機率明示為推定；回答「不是」會標示牌池未同步並隱藏機率，仍可手動記錄。工具不會讀取遊戲畫面，補滿規則仍待實際遊戲觀察驗證。

紀錄保存在此瀏覽器，重新整理或重開頁面會恢復週期、回合與手牌；分數、剩餘數與機率由紀錄重算。僅本機，沒有雲端備份或跨裝置恢復。與遊戲核對實際剩餘數、手動修正與推薦尚未提供；21 點或爆牌後的分布僅為理論試算，不代表遊戲允許繼續抽取。

### 本機儲存與失敗復原

採 localStorage，使用單一 key `dito-forge:local:v1` 保存 `LocalEnvelope`。`session.schemaVersion` 為 1，只保存週期與回合等原始紀錄，不保存分數、剩餘庫存或機率。裝置 ID 與保留的雲端欄位同一次 `setItem` 原子替換；未啟用雲端，沒有待同步批次。選用理由是目前操作與計算皆同步，單份 envelope 不需要多筆資料交易，也不新增依賴。

版本 1 的時間欄位接受 `Date.toISOString()` 產生的標準 UTC 字串（例如 `2026-10-08T09:00:00.000Z`）；非標準日期文字或不可能的日期會被拒絕並保留原始資料，不由瀏覽器猜測日期格式。

每次合法操作先成功寫入，再更新畫面。讀取失敗、格式／版本／紀錄驗證失敗或寫入失敗會停止記牌，不自動刪除、重置或覆寫資料；可下載取得的原始字串為 `.txt` 供復原，這不是一般 JSON 匯出入功能。無法讀取時不提供虛構下載。排除儲存權限／容量問題後可明確重新讀取，載入有效紀錄；失敗操作不會自動重放。

寫入前會檢查其他分頁是否更動同一 key，發現差異就停止寫入，重新讀取才接續。此檢查不是跨分頁鎖或原子 compare-and-swap；請只在一個分頁記牌。清除網站資料、私人瀏覽結束、瀏覽器清理／容量限制仍可能失去紀錄，localStorage 不取代外部備份。此版本不載入已啟用雲端的 envelope，會保留原始資料並顯示錯誤，避免丟失待同步欄位。

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
| Luna Low | GPT-6 Luna／low | `g6-luna-low-explorer`、`g6-luna-low-content-worker`、`g6-luna-low-qa-runner` | 機械探索、資料／內容建立、QA 執行與長時間 runner |
| Luna Medium | GPT-6 Luna／medium | `g6-luna-med-engineer`、`g6-luna-med-bug-fixer`、`g6-luna-med-reviewer` | 一般 feature／bug fix、測試設計、局部重構與一般 review |
| Luna Max | GPT-6 Luna／max | `g6-luna-max-core-engineer`、`g6-luna-max-bug-fixer`、`g6-luna-max-deep-reviewer` | 僅複雜核心／跨模組、Save／Migration／Determinism／Race 與深度 review |
| Independent Auditor | 未參與施工的獨立 context；依路由規則與工具能力選擇 | 依工作選用符合實際 effort 的 reviewer | 必要獨立稽核；L3 最終授權仍屬人類 Owner |

直接選一次可可靠完成工作的最低成本角色，整體成本包含重試與升級；不採固定 Low→Medium→Max→Sol pipeline，不先把明顯屬於 Medium／Max 的任務交給 Low，也不重做 Subagent 已可靠完成的工作。一般 bug 的修復由 Medium 負責；只有較低成本的合理嘗試已證明不足或確認核心／高風險時才升級。分級路由、升級條件與委派契約見 [Subagents](docs/SUBAGENTS.md#3-分級路由)；一般 L1／L2 review 的執行者與 fallback 見 [Review 規範](docs/agents/review.md)。工具 task name 轉換不得改變 requested model／effort／role；task name 不代表 runtime 身份。切換主 Agent 模型不改變 Ticket、安全與 Git 權限。

Skill 首選來源與適配見 [Skill Workflows](docs/agents/skill-workflows.md)；若專案另選來源，在此記錄完整 Skill 名稱與理由，避免僅寫短名稱造成不同裝置選到不同流程。

主 Agent 的 GPT-6.1 Sol 模型 ID、推理設定、官方來源與證據邊界見 [模型設定](docs/agents/models.md)，只在設定或核對模型時讀取。

## 驗證

<!-- 保留實際存在的變更類型；不適用時標記 N/A。 -->

| 變更類型 | 首選驗證 | 替代驗證或限制 |
| --- | --- | --- |
| 文件 | `npm run lint`（工作目錄：repo 根目錄）；成功判準：ESLint 無錯誤 | 若環境無法安裝依賴，改以檢查 ESLint 設定與受影響檔案；不能取代實際執行 |
| 程式模組 | `npm run typecheck`；成功判準：app 的 `vue-tsc --noEmit -p tsconfig.app.json` 與工具設定的 `tsc --noEmit -p tsconfig.node.json` 皆通過 | 無替代；未通過不得視為完成 |
| API | N/A（Ticket 01 尚未建立 API） | N/A |
| UI | `npm run test`、`npm run build`、`npm run e2e`；成功判準：單元測試、Vite production build 與 Playwright chromium 桌機／375px 專案皆通過 | 若 Chromium 無法下載，記錄下載原因；靜態檢查不能證明瀏覽器 e2e 通過 |
| 資料遷移 | N/A（Supabase 之後） | N/A |
| 設定 | `npm ci`；成功判準：依 lockfile 安裝且不改寫依賴版本 | 若 registry 不可用，保留 npm 錯誤作為環境限制證據 |

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

- `src/domain/index.ts`：牌池、A 計分、級距分類、下一抽機率與百分比格式化的純函式。
- `src/domain/gameReducer.ts`：純函式處理抽牌、撤銷、完成、開始回合與補滿觀察；保留已完成回合及週期，只從目前週期抽牌序列推導庫存。
- `src/stores/forgeStore.ts`：Pinia 復原回合與週期紀錄，依少於 15 顆的換局邊界建立新週期；ID 與時間由 store 產生，保存成功後才提交狀態。
- `src/services/persistence.ts`：本機 envelope 的 schema／紀錄驗證、單一 key 寫入及保留原資料的錯誤復原；不保存推算結果。
- `src/components/`／`src/App.vue`：確認狀態、手牌、點數鍵、五級分布與本局操作；共用 ConfirmDialog 管理應用程式內完成確認，介面不另計算遊戲規則。
- `src/styles/tokens.scss`：色彩 token 正本；[DESIGN.md](DESIGN.md) 記錄目前的 UI 契約，完整視覺規格仍以 `docs/UIUX Design.md` 為準。
- `tests/unit/`／`tests/e2e/`：domain／store／介面單元測試及瀏覽器操作驗證。

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
