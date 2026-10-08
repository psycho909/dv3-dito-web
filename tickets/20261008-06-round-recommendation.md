# 06 本局推薦提示

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」；演算法依三輪原型結論（`docs/research/`）
- Risk: L2
- Updated: 2026-10-08
- Branch: work
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

每次輸入後，在機率卡下方顯示以「最終點數接近 21」為目標的本局停手／再抽建議。

## Scope

- FR-13：`recommendWithinRound` exact expectimax、每局清空快取、狀態／時間上限回傳 `COMPUTATION_LIMIT`、各種閘門（UNSYNCED／N=0／21／BURST／0 分）。
- UI：D2 RecommendationHint（只看本局、常駐「不代表獎勵最高」小字、限制時顯示「目前無法計算建議」）。
- 測試：T34～T37、AC-14。

## Out of Scope

- L2 週期修正（附錄，未採用）、Web Worker（除非瀏覽器實測超標）。

## Acceptance

- [x] 4、7、6 建議 `STOP`，stopDistance 4，drawExpectedDistance `15.755102040816325`（容差 1e-9）。
- [x] 與無 memo 暴力枚舉 1,000 組比對一致；全新 52 顆空手牌不觸發上限。
- [x] 瀏覽器（Playwright CPU 4×、手機 viewport）p95 < 50 ms 有量測紀錄。

## Constraints and Decisions

- BURST 距離固定 22；不使用 Monte Carlo。
- 2026-10-08 Owner 要求「繼續」，接續已驗收 05；只做 FR-13 本局推薦，不啟用週期修正、雲端或一般匯出入。
- 分工：`g6-luna-max-core-engineer`（gpt-6-luna／max）擁有精確演算法；`g6-luna-med-engineer`（gpt-6-luna／medium）擁有 store／介面與相關測試；QA 由 Luna Low 執行，複雜演算法由未參與施工的 Luna Max 獨立深度審查。主 Agent 負責契約、文件與最終整合。
- memo 只存在單次求解內，返回即釋放，比局末清空更嚴格，不保留跨局／跨週期 cache。相同期望距離選 STOP，不改 exact 目標或引入近似。

## Dependencies and Blockers

- 前置 02 已驗收；無阻塞。

## Evidence

- Verification: 初始工作樹乾淨，基準 `e60d4d26dd686f4c6471598e003c9ffdeba8b823`；2026-10-08 `npm run test` 65/65 通過。使用 `matt-skills-curated:implement`／`tdd`，介面沿用 `frontend-design-premium:frontend-design`／`frontend-design-premium` 1.4.0；既有雲端 setup 已具備，不改環境設定。
  - 工程與 reviewer 曾因平台使用額度中斷；Owner 再次要求「繼續」後恢復原 Agent context，未以中斷工作冒充完成。恢復時 targeted 檢查為 18 passed／2 failed：推薦閘門尚未實作，以及 store 測試未讀取 lazy computed；已交回原 owner。`4、7、6` 精確案例已通過，完整驗收尚待後續證據。
  - 委派工具可指定實際 model／effort，但沒有 name／rename 參數；各任務指令與正式紀錄使用 README 固定名稱，平台自動暱稱不能修改，不把任務文字當成已改名的證據。
  - 核心 owner 回報已凍結三檔，targeted recommendation 9/9、typecheck、指定檔案 lint 通過；known case、閘門、state／time 預算有預期原因 RED→GREEN。固定 seed `0x20261008` 的 1,000 組 1～12 顆牌池，使用無 memo、完整手牌與獨立 A 指派計分 oracle，動作與期望距離容差 1e-9 全數一致。terminal leaves 不計入非終止狀態上限，但每次遞迴及返回前均檢查時間；達上限不輸出 partial distances。瀏覽器效能另由 QA runner 實測，不以核心 Node 測試代替。
  - 介面 owner targeted 44/44（Hint 8、store 18、App 18），typecheck／全域 lint 通過。已觀察 store computed、0 點說明、初始 grid 與 live region 範圍的 RED→GREEN；computed 測試修正為先讀取公開結果再驗證，不以增加 watcher 改變產品行為。推薦只由 READY／ACTIVE 的紀錄衍生，不寫入 envelope，寫入錯誤時隱藏、重讀不重放失敗輸入。
  - 最終 QA：`g6-luna-low-qa-runner` 於 repo 根目錄執行 `npm run test` 89/89（7 files）、`npm run e2e -- --workers=2 --reporter=list --retries=0 --trace=retain-on-failure` 72/72（mobile／desktop 各 36），皆 exit 0、0 skipped、0 retries；本票新增 E2E 各 3。E2E 使用 fresh production build／server，不另重跑已通過且未變更的 build。lint／typecheck 採工程 owner 已完成的執行回報，QA 未重跑、不捏造 raw exit output。
  - 瀏覽器 benchmark：`node tests/benchmarks/recommendation.mjs` 將正式 domain entry 以 Vite write:false 打包至記憶體；Chromium 140.0.7339.16、375×812px、CPU 4×。每案例 100 次全新 memo、不丟棄 warm-up，nearest-rank p95 為 fresh52 30.5 ms、small-ranks20 6 ms、small-ranks12 約 1.2 ms、4-7-6 約 0.7 ms。400/400 完整求解、0 COMPUTATION_LIMIT、exit 0；benchmark 與核心 hash 未變，未重跑。量測函式求解時間，不代表完整 UI latency 或實體手機。
  - Browser：DRAW／STOP、撤銷、重載、完成後隱藏、新局、未同步、reduced motion、鍵盤操作與 320／375／768／1024／1440px 通過。額外量測 320px 推定牌池的 DRAW→STOP，keypad document top 1354.34375→1354.34375px，位移 0px，hint 124px，無水平溢出；未盲目增加保留高度。
  - QA logs／400 筆效能樣本／10 張 desktop／mobile／estimated320 截圖保存在 `/tmp/dv3-ticket06-qa/` 與 `/tmp/dv3-ticket06-performance.json`。主 Agent 已目視桌機 STOP 與手機 estimated320 STOP，繁中、目標說明及真實機率可讀，沿用平塗 token 面板。暫存截圖 helper 曾因 DOM lookup／換行處理失敗兩次，只修 helper 後完成；不算正式測試重試，也不冒充 app regression。所有 QA 自啟 server 已停止，4173 無 listener。暫存產物可丟棄，正式測試及 benchmark runner 可重現。
  - Premium strict audit 0 findings；`designmd lint DESIGN.md` 0 errors、14 個既有 warnings（primary／frontmatter 色彩引用）。runtime tokens 與品牌未變，新增 RecommendationHint canonical owner；變更 UI 的 native dialog／非語意 click／外部請求等 anti-pattern 搜尋無 match。
  - 執行環境：Node 24.19.0／npm 11.9.0，沿用 README 的 npm／Playwright cache 與 fontconfig；`CI=1`。README 本機 Node 22 未另行驗證。
- Review / Audit：`g6-luna-max-deep-reviewer`（gpt-6-luna／max）未參與施工、獨立 context、全程唯讀。固定 base／HEAD `e60d4d26dd686f4c6471598e003c9ffdeba8b823`，檢查 `git diff --cached`、`git diff`、`git diff <base>...HEAD` 與相關新檔完整內容；凍結核心四檔先查、介面七檔與文件後查，未重做可靠核心探索。Standards PASS、Spec PASS、最終 READY，無未解決 finding；自行核對效能樣本、source／runner 指紋及 QA logs，未重跑可靠驗證。核心 SHA256 `166fd0206edb3a0eb8005ad0b3258cb7c5f5cd18b6e8f7f0e523556b571e164a`，benchmark SHA256 `cb1ab4a0a48a4ec3838781c28458e28f5cdd5c162b3896db5b13b3c0dacb1b41`。主 Agent 核對實際 diff、截圖與純 Ticket／TODO 結案，完成整合驗收。
- Commit / PR：實作與本 Ticket 同一 commit，可用 `git log -1 -- tickets/20261008-06-round-recommendation.md` 取得；依 README 授權 push `work` 並核對遠端。未建立 PR、未 merge、未部署。
- Remaining scope：只做本局接近 21 的代理目標，不宣稱最高獎勵或收益；未驗證實體手機、跨瀏覽器、完整 WCAG 或真實遊戲待確認規則。週期修正、雲端、Worker 不列為已完成。
