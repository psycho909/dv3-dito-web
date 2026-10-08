# 04 補滿邊界與週期紀錄

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-08
- Branch: work
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

局末剩餘少於 15 時，下一局自動換新 52 顆並留下可追溯的週期紀錄，玩家可一鍵確認遊戲是否真的補滿。

## Scope

- FR-03：`DeckCycle`（reason、triggeredByRoundId、previousRemaining、observation）、START_ROUND 的 `cycleCreated`、CONFIRM_CYCLE_OBSERVATION。
- UI：「下局預計補滿」提示、新局非阻擋提示「遊戲現在顯示 52 顆嗎？」（是／不是／稍後）、回答「不是」進入 UNSYNCED。
- 測試：T11、T12、T13、T21、T32、AC-03。

## Out of Scope

- 歷史修正（09）、手動重置（10）。

## Acceptance

- [x] 剩 15 換局不重置；剩 14 換局建立新週期，`previousRemaining = 14`；局中剩 14 不重置。
- [x] 回答「是／不是」分別記錄 `CONFIRMED_52`／`DENIED`，`不是` 時牌池為 UNSYNCED。

## Constraints and Decisions

- 補牌時機是待實測假設；若 Ticket「遊戲待確認規則實測」結果不同，先修規則文件再改本票。
- 2026-10-08 Owner 要求「繼續」，接續 Ticket 03。主 Agent 負責 reducer／store／文件；UI、QA 與獨立 reviewer 分別依 README 指派 Luna Medium、Low、Medium，沿用 `g6-luna-<effort>-<doing>` 角色名稱。
- T32 的實際剩餘數／手動修正入口與本票 Out of Scope 存在範圍落差，已詢問 Owner 是否擴充，尚未取得擴充指示。依本票明示範圍只提供補滿觀察；實際數量核對與手動修正分別留給 08／10。T32 的修正入口子項不列為本票已覆蓋。

## Dependencies and Blockers

- 前置 Ticket 03 已驗收；本票範圍無阻塞。實際遊戲補滿時機仍待 Owner 的平行觀察票確認。

## Evidence

- Verification（2026-10-08；工作目錄 repository 根目錄）：
  - Baseline：工作樹初始乾淨，HEAD `0beb62eacacc6b5e2dda30f9851a33ae721a34c8`；Ticket 03 既有 32 項單元／28 項 E2E。
  - 最終 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build` 通過；單元測試 41/41（domain 10、reducer 9、store 11、App 11）。`CI=1 npm run e2e -- --workers=2` 最終 42/42 通過，desktop／mobile 各 21，本票新增各 7 項；無 retries。
  - 環境：Node 24.19.0／npm 11.9.0；`NPM_CONFIG_CACHE=/tmp/dv3-dito-web-npm-cache`、`PLAYWRIGHT_BROWSERS_PATH=/tmp/dv3-dito-web-playwright-browsers`、`FONTCONFIG_FILE=/workspace/shared/dv3-dito-fonts.conf`。指定本機 Node 22 未另行驗證。
  - E2E 草稿初次失敗來自過寬 selector、未提供的歷史 UI 假設及把推定庫存當一般庫存文字。修正為實際操作契約，仍嚴格斷言 DENIED 後輸入使庫存 52→51、撤銷回 52、下一局無機率；未放寬補滿邊界或未同步行為。最後全套重跑通過，`git diff --check` 通過。
  - Browser：鍵盤回答／稍後重開、320／375／768／1024／1440px 無水平溢出、可見按鈕至少 44×44px 通過；reduced-motion 下提示可見。18 張 desktop／mobile 截圖位於 `/tmp/dv3-ticket04-qa/screenshots/`。
  - TDD：初始週期狀態、14／15 換局邊界、補滿觀察各先 assertion RED，再 reducer GREEN；store 新週期兩項先 RED（未補滿／缺少提示），觀察入口先 RED（方法未提供），整合後 GREEN。UI 新觀察操作先 RED 再 GREEN；額外防護與回歸補強不宣稱皆有獨立 RED。
  - AC-03／T11／T12／T13／T21：reducer／store 驗證 15 承接、局中 14 不補滿、下一局 52、舊局與週期保留、目前週期獨立庫存、原因／時間／觸發局及 previousRemaining；空牌池也僅在下一局建立新週期。
  - T32（本票子範圍）：是／不是記錄觀察、稍後不記錄且可重新開啟；DENIED 後為 UNSYNCED，庫存標示推定且不顯示機率，仍可記錄、撤銷、完成與新局。實際剩餘數輸入／修正入口尚未提供，不宣稱完整 T32 通過。
  - Premium strict audit 0 findings；`designmd lint DESIGN.md` 0 errors、14 個既有 warnings（沒有另造 primary／frontmatter 未引用色彩）。沿用 tokens.scss 色盤、面板與系統字型，不新增資產／依賴；frontend-design-premium 的誠實狀態與焦點契約促成推定標示、非阻擋觀察及稍後可重開。
  - 主 Agent 已目視核對 `/tmp/dv3-ticket04-qa/screenshots/mobile-new-cycle-observation-prompt.png` 與 `desktop-observation-denied-unsynced.png`。截圖為可丟棄環境產物，正式 E2E 可重現，不宣稱全面 WCAG／跨瀏覽器／實際遊戲驗證。
- Review / Audit：
  - UI：`g6-luna-med-ui-engineer`；QA：`g6-luna-low-qa-runner`；未參與施工的獨立 context：`g6-luna-med-standards-reviewer`／`g6-luna-med-spec-reviewer`。工具明確指定 `gpt-6-luna`，工程／review `medium`（角色名 med）、QA `low`；平台暱稱不作 runtime 身份證據。
  - 採 implement／tdd／code-review，UI 採 frontend-design 與 frontend-design-premium；規範與需求兩軸分開檢查固定基準至工作樹的 diff 及新增元件／E2E，均無待修正 finding。審查不代替 QA，主 Agent 負責最終整合 Gate。
- Commit / PR：實作與本 Ticket 同一 commit，可用 `git log -1 -- tickets/20261008-04-refill-cycle-boundary.md` 取得；依 README 授權 push `work` 並核對遠端。未建立 PR、未部署。
- Remaining scope：刷新仍清除本頁紀錄；下一張 05 處理本機持久化。核對實際數量／歷史修正／手動重置／完整視覺無障礙驗收仍留後續票；補滿規則是待實測假設。
