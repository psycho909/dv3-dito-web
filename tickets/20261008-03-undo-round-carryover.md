# 03 本局撤銷與跨局承接

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-08
- Branch: work
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

玩家可以撤銷本局誤輸入、完成本局並開始新局，牌池正確承接到下一局。

## Scope

- FR-02、FR-07：`gameReducer` 的 RECORD_DRAW、UNDO_DRAW、FINISH_ROUND、START_ROUND（不含補滿）；撤銷只限 ACTIVE 回合，空手牌時 disabled；完成本局、開始新局不可撤銷。
- UI：撤銷按鈕與「已撤銷：6」回饋、完成本局、開始新局。
- 測試：T14（不含重做）、AC-02、AC-07。

## Out of Scope

- 補滿邊界、持久化、重做（選做）。

## Acceptance

- [x] 4、7、6 撤銷後為 4、7、11/21、剩 50。
- [x] 完成本局後開新局，手牌 0、剩 49，4／7／6 各少 1。
- [x] 連續撤銷到空手牌後按鈕 disabled，不影響上一局。

## Constraints and Decisions

- 撤銷範圍已由 Owner 決定：只限本局。
- 2026-10-08 Owner 要求「繼續開發」，接續 Ticket 02 完成結果。主 Agent 處理 reducer／store 與整合；UI 指派 `g6-luna-med-ui-engineer`，QA 與獨立 reviewer 依 README 分派 `g6-luna-low-qa-runner`／`g6-luna-med-reviewer`。
- 完成本局是不可撤銷的鎖定，介面先以應用程式內確認對話框說明；開始新局承接牌池，不另補滿。空手牌可完成，21／BURST 不自動完成。時間／ID 由 store 提供，reducer 保持純函式。

## Dependencies and Blockers

- 前置 Ticket 02 已完成；無阻塞。

## Evidence

- Verification（2026-10-08；工作目錄 repository 根目錄）：
  - Baseline：19 項單元測試及 `npm run typecheck` 通過；工作樹初始乾淨，HEAD `6c07e0fef3252b8a24deb730aa1d4330429a4bb8`。
  - 最終 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build` 通過；單元測試 32 項（domain 10、reducer 5、store 9、App 8）。
  - `CI=1 npm run e2e -- --reporter=list --workers=2` 最終 28/28 通過，desktop／mobile 各 14。Ticket 03 新增各 7 項，Ticket 02 回歸各 7 項。
  - 環境：Node 24.19.0／npm 11.9.0；`NPM_CONFIG_CACHE=/tmp/dv3-dito-web-npm-cache`、`PLAYWRIGHT_BROWSERS_PATH=/tmp/dv3-dito-web-playwright-browsers`、`FONTCONFIG_FILE=/workspace/shared/dv3-dito-fonts.conf`。指定本機 Node 22 未另行驗證。
  - AC-02／AC-07／T14（不含重做）：reducer、store、App 與 E2E 覆蓋 4／7／6 撤銷、完成鎖定、新局手牌歸零與剩 49、空手牌不可撤銷及舊局不受影響；store 另驗證剩 14 與空牌池的新局不補滿。
  - TDD：reducer 入口最初不存在（module RED），再逐片驗證建立、抽牌／撤銷、完成／新局；AC-07 曾因手牌仍空得到 assertion RED、AC-02 曾因 activeRoundId 未清除得到 assertion RED，加入對應行為後 GREEN。未知事件防護先 RED（意外 FINISHED）再修正為 no-op。store 撤銷、完成 public seam 各先缺少方法 RED，再整合 reducer 通過。UI 新操作先 2 failed／4 passed，再完成介面至 GREEN；其他 guards 為回歸補強，不宣稱皆另有 RED。
  - 完整 E2E 初次 26 passed／2 failed，原因是舊測試把全頁按鈕總數固定為 10；改為精確計算 10 個 `[data-rank-key]`，未放寬庫存或 disabled 斷言。只重跑受影響的 lint／完整 E2E，Playwright 使用新 build，最終全部通過。
  - Browser：確認取消、Escape、Tab／Shift+Tab 循環、背景焦點阻擋、取消焦點返回、開始新局焦點及 21／BURST 不自動完成均通過。320／375／768／1024／1440px 操作按鈕至少 44×44px、無水平溢出，scrollbar-color 非 auto。
  - 8 張桌機／375px 截圖涵蓋 undo、confirm-open、finished、new-round，位於 `/tmp/dv3-ticket03-qa/screenshots/`；主 Agent 已目視核對手機確認／新局及桌機完成狀態。截圖為可丟棄環境產物，正式 E2E 可重現，不宣稱全面 WCAG／跨瀏覽器驗收。
  - Premium strict audit 0 findings；`designmd lint DESIGN.md` 0 errors、14 個既有 warnings（未另建 primary；frontmatter 元件未引用色彩）。色彩仍由 tokens.scss 擁有；新增 ConfirmDialog 沿用既有 token 與 8px 圓角，只讓 modal 使用 token 衍生遮罩／陰影，不改靜態面板或品牌。native-dialog 搜尋只命中元件自己的 `confirm` handler，未呼叫 browser alert／confirm／prompt。`git diff --check` 通過。
- Review / Audit：
  - UI：`g6-luna-med-ui-engineer`；QA：`g6-luna-low-qa-runner`；未參與施工的獨立 context reviewer：`g6-luna-med-reviewer`。實際入口明確指定 `gpt-6-luna`，工程／review `medium`（角色名 med）、QA `low`；名稱不作 runtime 暱稱／身份證據。
  - Reviewer 固定 base／HEAD 為 `6c07e0fef3252b8a24deb730aa1d4330429a4bb8`，檢查 staged（空）、unstaged diff 與 5 個相關新檔，納入舊 E2E selector 相容性修正。Standards／Spec 均無待修正 finding；主 Agent 最終依 QA 與實際 diff 驗收。
  - 採 `matt-skills-curated:implement`、`matt-skills-curated:tdd`、`matt-skills-curated:code-review`，review 按 repository 適配採一名獨立 reviewer 分開兩個面向。UI 使用 frontend-design 與 frontend-design-premium 1.4.0；其確認與無障礙契約促成應用程式內完成確認、焦點管理及固定 live region。
- Commit / PR：實作與本 Ticket 同一 commit，可用 `git log -1 -- tickets/20261008-03-undo-round-carryover.md` 取得；依 README 授權 push `work` 並核對遠端。未建立 PR、未部署。
- Remaining scope：沒有重做、補滿邊界、歷史修正介面或持久化；刷新清除本頁紀錄。下張 Ticket 04 才處理新局 `<15` 的補滿週期，完整視覺／無障礙驗收仍留 Ticket 11。
