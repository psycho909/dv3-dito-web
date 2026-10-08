# 02 記牌最小閉環

- Status: completed
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-08
- Branch: work
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

玩家確認從 52 顆開始記錄後，點數鍵輸入就能即時看到分數、剩餘數與五級距下一抽機率。

## Scope

- FR-01、FR-04、FR-05：初始牌池、A 的 1/11 計分、`calculateNextDraw` 輸出契約、牌池驗證。
- UI：DeckIntegrityStatus（UNINITIALIZED／SYNCED）、HandSummary、RankKeypad（5×2、剩餘數、用罄 disabled）、ProbabilityBreakdown（固定順序、百分比、比例條）。
- 測試：T01～T10、T17、T18。

## Out of Scope

- 撤銷、換局、持久化、推薦、明細抽屜。

## Acceptance

- [x] 4、7、6 後畫面顯示 17/21、剩 49、`6.12% / 16.33% / 8.16% / 0.00% / 69.39%`。
- [x] AC-01、AC-04、AC-05 有自動化測試且通過。
- [x] 某點數用完後該鍵 disabled 並顯示「剩 0」；牌池空時不出現 NaN。

## Constraints and Decisions

- 剩餘數由事件推導，不另維護計數器；機率用整數顆數計算，顯示才捨入（最大餘數分配）。
- 2026-10-08 Owner 再次要求「下一步」，接續已核准 Ticket 02。domain 與 UI 分派 `g6-luna-med-domain-engineer`／`g6-luna-med-ui-engineer`；QA／獨立審查另行分派。模型明確指定 `gpt-6-luna`，effort `medium`（名稱採 med）／`low`。

## Dependencies and Blockers

- 前置 Ticket 01 已完成；無阻塞。

## Evidence

- Verification（2026-10-08；工作目錄 repo 根目錄）：
  - `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build` 全部通過；單元測試 19 項（domain 10、store 5、App 4）。
  - `CI=1 npm run e2e -- --reporter=list --workers=2`：14/14 通過，desktop／mobile 各 7。涵蓋未確認、4／7／6、點數用罄、A 重新計分、21／BURST 理論提示、52 顆耗盡、鍵盤與 responsive。
  - 環境：Node 24.19.0／npm 11.9.0；`NPM_CONFIG_CACHE=/tmp/dv3-dito-web-npm-cache`、`PLAYWRIGHT_BROWSERS_PATH=/tmp/dv3-dito-web-playwright-browsers`、`FONTCONFIG_FILE=/workspace/shared/dv3-dito-fonts.conf`。本機指定 Node 22 未另行驗證。
  - AC-01／T01～T02 見 domain 初始牌池與 store 逐抽剩餘數；AC-04／T03 見 domain 固定顆數及 App／E2E 固定百分比；AC-05／T04～T09 見 domain 六組 A 案例；T10／T17 見 store 與 E2E 用罄／耗盡；T18 以 110 組 deterministic 合法手牌／牌池檢查非負機率、庫存上限、級距顆數合計及機率總和，非窮舉或隨機 property runner。
  - TDD：domain 按 public seam 分段 RED→GREEN；store 的確認與記牌先以未實作行為得到 RED，再加入邏輯通過；App 新增行為先 3 項失敗，再完成介面整合通過。後續 guards／precision assertion 為回歸補強，不宣稱各自另有 RED。
  - QA 檢查 320／375／768／1024／1440px 無水平溢出，點數鍵至少 44×44px，computed scrollbar-color 非 auto。最新截圖位於 `/tmp/dv3-ticket02-qa/screenshots/{desktop,mobile}-4-7-6.png`，主 Agent 已目視確認。截圖為本環境診斷產物，不是 Git 持久化證據；E2E 可重現。
  - Premium strict audit 0 findings；`designmd lint DESIGN.md` 0 errors、14 warnings（既有語意色名未另建 primary、元件未在 frontmatter 引用色彩）。沿用 tokens.scss canonical owner，不為清除警告另加品牌色。`git diff --check` 通過。
- Review / Audit：
  - `g6-luna-med-domain-engineer`／`g6-luna-med-ui-engineer` 各自施工；`g6-luna-low-qa-runner` 執行完整驗證；獨立 context `g6-luna-med-reviewer` 檢查 tracked／untracked 實作及文件，最終接受。
  - 指定模型皆為 `gpt-6-luna`；工程／review effort `medium`（角色名 med），QA `low`。名稱為工作角色對照，不宣稱平台暱稱代表 runtime 證據。
  - Review P2：最大餘數百分比缺少兩位精度說明，已補文案與 App regression assertion；P3：DESIGN 輔助字級與 13px 實作不一致，已明定 13px 下限。主整合檢查另移除 UI 重複級距規則、共用 RANKS／面板 owner，修正過小文字與中點分隔。
- Commit / PR：實作與本 Ticket 同一 commit，使用 `git log -1 -- tickets/20261008-02-record-draw-loop.md` 取得；依 README 授權 push `work`。未建立 PR、未部署。
- Remaining scope：刷新仍清除本頁資料；撤銷／跨局承接／持久化尚未實作。字型資產與完整視覺／無障礙驗收留 Ticket 11，不宣稱 V1 已完成。
