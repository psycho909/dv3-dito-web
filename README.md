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

要在本機顯示 GitHub 登入，複製 `.env.example` 為 `.env.local`，填入 Supabase Project URL 與 publishable key 後重新啟動 Vite。這兩項會提供給瀏覽器使用；禁止使用 `service_role` 或 secret key。

`npm run preview` 可預覽 production build。ESLint 檢查正式程式與設定，排除 `.scratch` 原型及產物；Vitest 只收集 `tests/unit/**/*.test.ts`；Playwright 使用 Chromium 執行桌機及 375px 手機測試。

目前 Codex 雲端環境使用 Node 24.19.0／npm 11.9.0，已通過五項驗證。雲端執行時使用下列環境設定（本機一般不需要）：

```bash
export NPM_CONFIG_CACHE=/tmp/dv3-dito-web-npm-cache
export PLAYWRIGHT_BROWSERS_PATH=/tmp/dv3-dito-web-playwright-browsers
export FONTCONFIG_FILE=/workspace/shared/dv3-dito-fonts.conf
```

fontconfig helper 保存在雲端環境快照中，排除鎖定版 Chromium 無法讀取的系統 WOFF2 字型，讓繁中標題正常顯示；它不是應用程式資產。一般 clone 使用作業系統正常提供的字型與 Playwright browser cache。

## 部署

正式網站：[迪特的鐵匠鋪機率計算器](https://dv3-dito-web.vercel.app/)。沿用Owner提供的 [Vercel既有專案](https://vercel.com/psycho909s-projects/dv3-dito-web)，推送main自動部署；2026-10-11已驗證Production桌機／375px流程、JSON還原、安全標頭與資產雜湊，設定與證據見 [部署指南](docs/DEPLOYMENT.md)。此版只保存本機資料；換網址／裝置前先匯出JSON備份。

### Supabase GitHub 登入

網站使用 `@supabase/supabase-js` 的 GitHub OAuth 登入；目前登入只建立 Supabase Auth session，不會上傳或同步記牌資料。GitHub OAuth App 的 Authorization callback URL 為 `https://lcsyotvievikernvhquj.supabase.co/auth/v1/callback`，並需在 Supabase Authentication 的 GitHub Provider 輸入 OAuth Client ID／Secret。Client Secret 僅保存在 Supabase Dashboard；網站環境只設定 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_PUBLISHABLE_KEY`。Supabase Auth URL Configuration 的 redirect allow list 需包含 `http://localhost:5173` 與正式網站 `https://dv3-dito-web.vercel.app`。

## 目前可用功能

確認從完整 52 顆牌池開始記錄後，按點數鍵記錄遊戲已抽出的石頭。分數會自動重新判定 A 的 1／11 點，並同步顯示剩餘顆數與下一顆的五級結果分布。用罄的點數不能再輸入；牌池空時停止機率計算，不會自動補滿。

可撤銷目前尚未完成的一局最後一次輸入。完成本局前會確認；完成後鎖定手牌與最終分數。局末剩餘至少 15 顆時，開始新局沿用牌池；少於 15 顆時，下一局才依規則推定換成新 52 顆週期，局中不補滿。已完成回合及舊週期紀錄保留，不能以撤銷修改。

新週期可回答遊戲是否顯示 52 顆，也可稍後再確認。未確認前數量與機率明示為推定；回答「不是」會標示牌池未同步並隱藏機率，仍可手動記錄。工具不會讀取遊戲畫面，補滿規則仍待實際遊戲觀察驗證。

可展開「核對遊戲剩餘顆數」，輸入遊戲顯示的 0～52 整數。不一致時隱藏精確機率與推薦，保留原始紀錄與核對目標；補記已知遺漏點數或撤銷誤記後，重新核對遊戲當下數量，與原目標及工具總數一致才恢復同步。不會依總數差額猜測點數。否認補滿後，總數相同仍無法證明牌池組成，需等待合法新週期並確認補滿。

「查看歷史與修正」列出所有回合，可替換、插入或移除任一局的抽牌，附上修正原因。先預覽從頭重算後的回合、牌池與週期邊界，再確認套用。未確認的推定補滿可自動調整；已確認或手動指定的邊界保留，不符補滿門檻時需確認警告。超抽會拒絕修正，預覽不會改寫紀錄；修正保留前後序列與原因，也不會自動消除既有未同步核對目標。

紀錄保存在此瀏覽器，重新整理或重開頁面會恢復週期、回合、手牌、修正紀錄與核對狀態；分數、剩餘數、機率與推薦由紀錄重算。僅本機，沒有雲端備份或自動跨裝置恢復。21 點或爆牌後的分布僅為理論試算，不代表遊戲允許繼續抽取。

可展開「備份與資料管理」下載 JSON，或選取備份先驗證、比較目前與備份的摘要，再確認覆蓋。備份為 `schemaVersion: 1` 的記牌 session，包含週期、回合、核對目標與修正紀錄；不含裝置識別、雲端佇列或認證資訊。單一檔案上限 5 MiB（UTF-8），只接受此 session 格式；格式、版本、點數、超抽、週期或引用不合法會拒絕，保留原資料。匯入不合併紀錄；預覽後資料變動須重新預覽，建議覆蓋前先匯出目前紀錄。

確認遊戲確已補滿 52 顆後可手動重置牌池：保留舊週期與修正紀錄，完成進行中的舊局，建立新的空手牌回合與固定 `MANUAL_RESET` 週期，清除舊核對目標。這不同於一般開始新局。另可確認「只清除此裝置資料」，只移除本程式的本機 key，保留其他站點資料；不刪雲端、不自動開始新的 52 顆紀錄。重置與清除無法撤銷，確認對話框預設聚焦取消。

### 手動同步玩法

1. 在遊戲確認保管箱已補滿 52 顆，再按工具「確認從 52 顆開始記錄」。
2. 每次先在遊戲抽牌，看清點數後才按工具對應點數鍵；誤按可撤銷，工具不會替你抽牌。
3. 遊戲完成本局後，在工具確認「完成本局」，下一把按「開始新局」。4／7／6 的範例為 17/21、剩 49；正常換局仍剩 49，不重新建立牌池。
4. 遊戲剩餘數不同時，展開「核對遊戲剩餘顆數」。未同步期間不能保證精確機率；只補記已知遺漏點數或修正誤記，再核對，不依差額猜牌。
5. 局末少於 15 顆時，工具推定下一把補滿；請依遊戲畫面回答是否為 52。只在遊戲確實補滿後使用手動重置，重要紀錄先匯出 JSON。

### 待確認遊戲規則

| 待確認項目 | 目前處理 |
| --- | --- |
| 少於 15 顆是否一律在下一局開始前補滿；剛好 15 是否不補 | 採既有跨局假設，保留補滿觀察與未同步提示 |
| 21 點是否強制結算、爆牌後能否繼續抽、0 點能否完成 | 顯示理論試算，不宣稱遊戲允許這些操作 |
| 局內抽光剩餘牌池時遊戲如何處理 | 工具停止下一抽計算，不在局中補牌 |
| 下注成本、倍率與五級獎勵 | V1 不推算收益，不因推薦猜測獎勵 |

確認來源與觀察任務見 [遊戲規則](docs/遊戲詳細規則.md)及 [實地觀察 Ticket](tickets/20261008-game-rule-observation.md)。本機整體驗收紀錄與Owner已豁免的人工流程見 [Ticket 12 證據](docs/verification/ticket12/README.md)；Chromium 的行動模擬不代替實體手機單手操作。雲端備份與部署依後續 Ticket 辦理。

### 本局推薦

機率卡下方提供「再抽／停手」說明，以本局最終點數接近 21 為目標，不代表獎勵最高，也不會操作遊戲。每次輸入或撤銷後，以目前剩餘牌池做精確 expectimax；爆牌距離固定 22，沒有 Monte Carlo、下注收益或整週期修正。未同步、牌池空、21 點或爆牌時不提供再抽／停手建議；推定週期會明示推定。

推薦同步在主執行緒計算，每次求解上限 50,000 states／200 ms。memo 只存在單次求解內，返回即釋放，不保留跨局／跨週期快取；相同期望距離選停手。超限只顯示「目前無法計算建議」，不提供近似或未完成結果，原本的下一抽機率不受影響。推薦與 cache 不寫入本機紀錄。

效能驗證入口：`node tests/benchmarks/recommendation.mjs`（repo 根目錄，沿用上方 Playwright 環境設定）。它將正式推薦模組打包到記憶體，在 Chromium、375×812px、CPU 4× 降速下，每案例執行 100 次全新 memo 求解、不丟棄 warm-up；nearest-rank p95 必須小於 50 ms，且全新 52 顆與多小點數牌池不得觸發計算上限。此數據量測函式求解時間，不等同完整輸入到畫面呈現延遲或實體手機驗證。

### 本機儲存與失敗復原

採 localStorage，使用單一 key `dito-forge:local:v1` 保存 `LocalEnvelope`。`session.schemaVersion` 為 1，只保存週期、回合與選用的 `corrections` 修正稽核紀錄，不保存分數、剩餘庫存或機率；沒有修正欄位的舊紀錄仍可載入。修正後的 session 與稽核資料、裝置 ID 與保留的雲端欄位同一次 `setItem` 原子替換；未啟用雲端，沒有待同步批次。選用理由是目前操作與計算皆同步，單份 envelope 不需要多筆資料交易，也不新增依賴。

版本 1 的時間欄位接受 `Date.toISOString()` 產生的標準 UTC 字串（例如 `2026-10-08T09:00:00.000Z`）；非標準日期文字或不可能的日期會被拒絕並保留原始資料，不由瀏覽器猜測日期格式。

每次合法操作先成功寫入，再更新畫面；清除也需成功移除本機 key 才發布未初始化狀態。讀取失敗、格式／版本／紀錄驗證失敗或寫入／清除失敗會停止記牌及資料管理，不自動刪除、重置或覆寫資料；可下載取得的原始字串為 `.txt` 供復原，與正常 JSON 備份格式不同。無法讀取時不提供虛構下載。排除儲存權限／容量問題後可明確重新讀取，載入有效紀錄；失敗操作不會自動重放。

寫入前會檢查其他分頁是否更動同一 key，發現差異就停止寫入，重新讀取才接續。此檢查不是跨分頁鎖或原子 compare-and-swap；請只在一個分頁記牌。清除網站資料、私人瀏覽結束、瀏覽器清理／容量限制仍可能失去紀錄，localStorage 不取代外部備份。此版本不載入已啟用雲端的 envelope，會保留原始資料並顯示錯誤，避免丟失待同步欄位。

分數板與點數鍵使用本機 OFL 數字字型 subset，其他內容維持系統字型；字型來源、授權及重建方式見 [`src/assets/fonts/README.md`](src/assets/fonts/README.md)。介面支援鍵盤與 reduced-motion；視覺與無障礙實測證據由 Ticket 11 保存。

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
- `src/domain/recommendation.ts`／`rules.ts`：本局精確 expectimax 與集中定義的爆牌距離；求解快取與計算限制不進入持久化。
- `src/stores/forgeStore.ts`：Pinia 復原回合與週期紀錄，依少於 15 顆的換局邊界建立新週期；ID 與時間由 store 產生，保存成功後才提交狀態。
- `src/services/persistence.ts`：本機 envelope 的 schema／紀錄驗證、單一 key 寫入及保留原資料的錯誤復原；不保存推算結果。
- `src/components/`／`src/App.vue`：確認狀態、手牌、點數鍵、五級分布、逐點數抽牌明細、牌池狀態／詳情與本局操作；結果畫面直接呈現 domain 分析，不另計算遊戲規則；共用 ConfirmDialog 與 DeckDetailDrawer 管理 modal 對話框。
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
