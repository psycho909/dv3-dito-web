# 10 匯出、匯入、重置與清除

- Status: done
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-11
- Branch: work
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

玩家可以備份與還原紀錄，並在明確確認後重置牌池或清除本機資料。

## Scope

- FR-08：JSON 匯出、匯入（格式、版本、牌池、週期邊界、引用驗證；預覽摘要；以 IMPORT_OVERWRITE 覆蓋）。
- FR-02：重置牌池（MANUAL_RESET，舊週期保留）、清除此裝置資料；兩者皆二次確認、說明影響。
- 測試：T15、T19、AC-08 本機後半。

## Out of Scope

- 刪除雲端紀錄（S5）。

## Acceptance

- [x] 匯出 → 清空 → 匯入後歷史、牌池、機率完全相同。
- [x] 不合法、超抽或版本不符的檔案被拒絕，原資料不受影響。
- [x] 匯出檔不含認證資訊。

## Constraints and Decisions

- 匯入 JSON 不執行任何程式碼；危險操作不使用 toast 直接執行。
- 匯出格式為 schemaVersion 1 的 PersistedSession JSON，保留週期、回合、核對與 corrections；不含 LocalEnvelope 的裝置、雲端欄位或認證。匯入同一格式，重用既有嚴格資料驗證，不默默接受未知欄位或雲端 envelope。
- 單一備份檔上限 5 MiB（UTF-8）；本機檔案讀取需忽略已取消或被新選檔取代的結果。匯入摘要比較目前與備份的局數、週期、抽牌、當前手牌、庫存及可信度；套用時拒絕本機變更或其他分頁更新造成的過期預覽。
- 手動重置只能在已初始化且本機儲存正常時執行，確認內容明示遊戲確已補滿 52 顆。保留舊回合及 corrections；進行中的舊局以重置時間完成，建立空手牌新局與固定 MANUAL_RESET 週期，清除舊核對目標並恢復同步。
- 只清除 `dito-forge:local:v1`，保留其他站點資料；確認後成功 removeItem 才發布未初始化狀態，不自動建立 52 顆紀錄。匯入、重置及清除都先驗證本機保存與其他分頁差異，失敗不發布新狀態；儲存錯誤期間沿用原始資料下載／重新讀取，不繞過尚未支援的雲端佇列保護。

## Dependencies and Blockers

- Blocked by：05。

## Evidence

- Verification（repo 根目錄）：
  - 基準／審查時 HEAD `1083bd2eb0d9b1fd210a52a237d9a8bd88e87582`，開始時工作樹乾淨；沿用 Ticket09 已通過的 137 unit／96 E2E baseline。
  - TDD：核心先 RED 7 failed／38 passed，實作後 GREEN；JSON 注入尾綴與讀取失敗保留 recovery raw 回歸先 RED 2 failed，修正後 GREEN。Store 先 RED 4 failed／24 passed，整合後 GREEN 28 passed；最終核心 owner 57 passed、UI owner 11 passed。
  - 最終 `npm test`：13 files／173 tests passed；`npm run lint`、`npm run typecheck`、`npm run build`、`git diff --check` 通過。
  - 正式 build 後以 README 的 FONTCONFIG_FILE／PLAYWRIGHT_BROWSERS_PATH 執行 `npm run e2e -- --reporter=line`：桌機與 375px 全量 106 passed（54.8s），0 failed／skipped。新增 Ticket10 桌機／手機 10 項，涵蓋 T15／T19、下載 session 不含裝置／雲端／認證、歷史與牌池及機率還原、非法／超抽／版本拒絕、取消／Escape、MANUAL_RESET、其他分頁更新拒絕、清除失敗復原及 320／375／768／1440 無水平溢出。
  - `python3 /tmp/dv3-premium-audit.py /workspace/dv3-dito-web --mode strict --output /tmp/dv3-ticket10-premium-audit.json`：0 findings。
- Delegation：
  - `g6-luna-max-core-engineer`（實際 `gpt-6-luna`／max）：reducer、persistence、backup 與核心單元測試。
  - `g6-luna-med-engineer`（實際 `gpt-6-luna`／medium）：DataManagementPanel 與元件單元測試。
  - 主 Agent 整合 store／App、E2E、文件與最終 Gate；角色路由目標 `g61-sol-med-orchestrator`，不以角色名稱推定 runtime 模型。工具沒有命名參數，以委派契約固定名稱為正本，隨機 nickname 不代表角色或模型。
- Skills：沿用 `cloud-environment-onboarding:setup`／`cloud-environment:cloud-environment-runtime` 的既有環境；開發採 `matt-skills-curated:implement`／`tdd`／`code-review` 及 `frontend-design-premium:frontend-design`／`frontend-design-premium:frontend-design-premium`，依專案 skill-workflows 適配。無依賴或環境設定變更。
- Review / Audit：獨立 `g6-luna-max-deep-reviewer`（實際 `gpt-6-luna`／max，未參與施工）完成全量與增量補查。Standards 無 finding；Spec 發現深巢狀 JSON 在合成 envelope 序列化時可能丟出 RangeError，已將解析／序列化／驗證包在共同錯誤邊界，回傳格式錯誤；補查確認 finding 解除，無剩餘阻擋項。主 Agent 最終 Gate 可接受；L2 未觸發正式 Independent Audit。
  - Scope：審查涵蓋 `git diff --cached`（空）、`git diff` 的 12 個修改檔，及 `git ls-files --others --exclude-standard` 的 5 個新增檔完整內容，共 17 檔；base 至 HEAD committed diff 為空。工程 12 檔 path→SHA256 sorted compact JSON fingerprint `08f82b79194335c44b63f49c1a1cc29391d9f63583246529e02cc284f0bf7a4b`；staging 前核對與全量／增量審查一致。
  - 最後修正回歸先 RED 1 failed／11 passed，修正後 backup／persistence／store 68 passed；其後全量單元 173 passed。修正後 ESLint／typecheck／build 通過，`npm run e2e -- tests/e2e/backup-management.spec.ts --reporter=line` 桌機／375px 10 passed（4.8s）。上述 106 E2E 為修正前全量，最後僅兩個審查檔變動，依影響範圍重驗備份整合。
  - 獨立 `g6-luna-low-qa-runner`（實際 `gpt-6-luna`／low）以 `node /tmp/g6-luna-low-qa-runner.cjs` 檢查 320px 未初始化／初始化／記一顆牌、原生 disclosure 鍵盤展開、取消初始焦點／Escape 回觸發按鈕、長檔名與非法 JSON 錯誤無水平溢出、錯誤焦點回檔案欄位、reduced-motion 生效；page errors 0。主 Agent 已檢視 `/tmp/ticket10-data-management-320.png`。此為 Chromium 模擬，未宣稱實體手機或螢幕閱讀器完整驗收；完整視覺與無障礙驗收仍由 Ticket11 執行。
- Commit / PR：待依 README standing authority 提交並推送目前 `work`，推送後以 `git ls-remote origin refs/heads/work` 核對；無 PR、merge 或 deploy。實際提交 SHA 與遠端核對以後續文件提交保存。
