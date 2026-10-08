# 05 本機持久化

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-08
- Branch: work
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

重新整理或重開頁面後，所有週期、回合與手牌都能正確恢復；資料損毀時不會默默清空。

## Scope

- FR-08 本機部分：`PersistedSession`（schemaVersion 1）、`LocalEnvelope`（雲端欄位保留但不使用）、原子性寫入；選型 localStorage 或 IndexedDB 並在 README 說明。
- 讀取失敗、結構損毀、版本不相容時進入安全錯誤狀態並提供匯出原始資料的入口。
- CloudBackupStatus 只顯示「僅本機」。

## Out of Scope

- JSON 匯入匯出（10）、雲端同步（S2）。

## Acceptance

- [x] 記 3 顆並完成本局，重新整理後歷史與剩餘數相同（AC-08 本機前半）。
- [x] 人為破壞儲存資料後顯示錯誤狀態，原資料未被覆寫。
- [x] 機率、剩餘數不被持久化，均由紀錄重算。

## Constraints and Decisions

- 持久化只保存事件與週期，不保存衍生結果。
- 2026-10-08 Owner 要求「繼續」，接續已驗收 Ticket 04。採單一 localStorage key 的 LocalEnvelope 原子寫入，先保存成功才提交記憶體狀態；讀取／驗證／寫入失敗停止修改並保留原資料，提供原始資料下載與明確重新讀取。雲端欄位保留但不啟用；一般 JSON 匯出入仍留給 10。
- Save／復原核心由 `g6-luna-max-core-engineer`（gpt-6-luna／max）負責；主 Agent 處理介面／整合／文件，QA 與獨立深度 reviewer 依 README 分派 Low／Max。各路徑單一 owner，禁止依賴／雲端設定／PR／部署擴張。
- 跨分頁僅在寫入前比對最後讀取的 raw，偵測差異時拒絕覆寫；localStorage 無原子 compare-and-swap，不宣稱排除所有同時寫入競爭。README 明示單一分頁記牌限制。

## Dependencies and Blockers

- 前置 04 已驗收；無阻塞。

## Evidence

- Verification（2026-10-08；repository 根目錄）：
  - Baseline：工作樹初始乾淨，HEAD `4e9be81dc182ff04bcb45a5e24722fd40e923d49`；主 Agent 開始施工前重跑單元測試 41/41 通過。核心工程角色開始時看到的 41/42 是本次 App 測試已加入且仍在 RED，不是原始基線失敗。
  - 核心 targeted：persistence 14/14、store 15/15、typecheck 與指定檔案 lint 通過；主 Agent 最後 App 14/14 與受影響介面 lint 通過。
  - 獨立 review 修正前 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build` 通過；unit 62/62（domain 10、reducer 9、store 15、App 14、persistence 14）。`CI=1 npm run e2e -- --workers=2 --reporter=list` 66/66 通過，mobile／desktop 各 33，本票新增各 12；0 retries。時間格式 review finding 修正後另記最終驗證。
  - QA 首輪 E2E 有 8 項 fixture 失敗：viewport 情境的資料清除時機與兩個 reload 情境仍預期舊版空白頁。依新持久化契約修正隔離與 reload 預期，保留庫存／手牌／機率斷言；未修改 app 遷就測試。最後以 fresh build／server 全套重跑通過。
  - 環境：Node 24.19.0／npm 11.9.0；`NPM_CONFIG_CACHE=/tmp/dv3-dito-web-npm-cache`、`PLAYWRIGHT_BROWSERS_PATH=/tmp/dv3-dito-web-playwright-browsers`、`FONTCONFIG_FILE=/workspace/shared/dv3-dito-fonts.conf`、`CI=1`。README 指定的本機 Node 22 未另行驗證。
  - Browser：ACTIVE／FINISHED 重載、同 context 重開分頁、未同步觀察保留、原始資料逐字下載、損毀／版本不符／讀寫失敗不覆寫、已觀察的跨分頁差異拒絕寫入與明確重讀通過。320／375／768／1024／1440px 復原畫面無水平溢出，按鈕至少 44×44px，鍵盤重讀可操作。
  - 10 張 active／finished／corrupt／write-failure／unsupported-version 的 desktop／mobile 截圖位於 `/tmp/dv3-ticket05-qa/screenshots/`；主 Agent 已目視核對手機損毀狀態與桌機 ACTIVE 復原。產物可丟棄，正式 E2E 可重現；不宣稱全面 WCAG／跨瀏覽器驗收。
  - 核心回報 7 次 RED→GREEN：入口缺失、有效 envelope 拒載、保存入口缺失、store 持久化 seam 缺失、剩 14 沿用非法週期被接受、過期核對數被保留、陣列 observation 被接受。額外 guard／回歸補強不宣稱每項另有 RED。
  - 主 Agent TDD：復原 `4、7、6` 先 expected 17／actual 0 RED，損毀 raw 先缺少安全錯誤 UI RED，接上 hydration／錯誤介面後 GREEN。另發現空牌池重讀成功後焦點留在 body，先建立 RED 再透過 RoundActions 的 focusFinishRound 修正為 GREEN。
  - 原始資料驗證涵蓋所有週期累積庫存、15／14 邊界、回合／週期引用、activeRoundId、觀察／時間配對與版本；不相容雲端欄位保留 raw 並拒絕使用，不丟棄佇列。非字串 observation 曾被 String 轉換誤接受，加入回歸 RED 再改嚴格列舉值比較；避免損毀的觀察值讓 UI 與機率可信度不一致。
  - 獨立 review 的 P2 修正：startedAt／finishedAt／observedAt 三個非標準日期字串案例先 3 failed／14 passed RED；改為有限 Date.parse 結果且 Date.toISOString() 與原字串完全一致，persistence 17/17 GREEN，scoped lint／typecheck 通過。無效日期原字串保留、不寫入；正常 writer 的標準 UTC 字串仍可復原。
  - 最終 QA（日期格式修正後）：原 QA owner 以 fresh build／server 重跑 lint、typecheck、unit 與完整 E2E，全部通過。unit 65/65（domain 10、reducer 9、store 15、App 14、persistence 17）；E2E 66/66，mobile／desktop 各 33，0 failures、0 retries。可丟棄的三輪驗證摘要保存在 `/tmp/dv3-ticket05-qa/evidence.md`。
  - Premium strict audit 0 findings；`designmd lint DESIGN.md` 0 errors、14 個既有 warnings（primary／frontmatter 色彩引用），色盤、系統字型與平塗面板不變。新增本機復原／僅本機 canonical owner；沒有虛假 saving、一般匯出入、清空或雲端備份入口。
- Review / Audit：`g6-luna-max-deep-reviewer`（gpt-6-luna／max）獨立 context 檢查固定基準 `4e9be81dc182ff04bcb45a5e24722fd40e923d49` 至 staged／unstaged／新檔；Standards 無 finding，Spec 發現 P2：Date.parse 接受非標準日期文字。採現有 writer 的 Date.toISOString() 作版本 1 時間格式契約，README 明示；由原核心 owner 補回歸並修正，原 reviewer 補查、原 QA 重驗，不重做已可靠完成的探索。最終 reviewer 確認 P2 已解決，Standards／Spec 無未解決 finding；reviewer 未重跑測試，測試證據由 QA owner 提供。主 Agent 依修正後 65/65 unit、66/66 E2E 與獨立複查完成整合驗收。
- Commit / PR：實作與本 Ticket 同一 commit，可用 `git log -1 -- tickets/20261008-05-local-persistence.md` 取得；依 README 授權 push `work` 並核對遠端。未建立 PR、未部署。
- Remaining scope：只涵蓋 AC-08 的本機重載部分；JSON 一般匯出入、雲端備份、跨裝置恢復與真實遊戲規則驗證不列為已完成。
