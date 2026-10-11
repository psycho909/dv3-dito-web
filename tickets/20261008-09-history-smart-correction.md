# 09 歷史與智慧型歷史修正

- Status: done
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」；智慧型修正由 Owner 確認「能達到智慧型紀錄去做調整就符合我的預期」
- Risk: L2
- Updated: 2026-10-11
- Branch: work
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

玩家可以查看所有局的歷史，修正舊局記錯的點數；工具從頭重算並預覽影響，確認後才套用。

## Scope

- FR-03 智慧型歷史修正：從第一個週期重播、預覽受影響回合與邊界新增／移除／移位；推定邊界自動調整；CONFIRMED_52、MANUAL_RESET、USER_CONFIRMED_FULL 固定並在不符時警告；只有非法重播（超抽、引用錯誤）才拒絕；單一 CORRECT_HISTORY 事件。
- UI：HistoryDrawer（局次、順序、最終分數與級距、週期分隔線與觀察狀態）、修正預覽。
- 測試：T20、T22、T31。

## Out of Scope

- 雲端上傳 CORRECT_HISTORY（S2）。

## Acceptance

- [x] 把剩 14 改成剩 15 時，預覽顯示邊界移除，確認後後續牌池正確。
- [x] 已確認 52 的邊界在修正後保持不動並顯示規則不符警告。
- [x] 造成超抽的修正被拒絕並指出衝突回合，資料不變。

## Constraints and Decisions

- 修正在套用前不改動任何既有資料。
- 從歷史選局編輯完整抽牌序列（替換、插入、移除），附修正理由；預覽與確認間若本機狀態或其他分頁已變動，拒絕套用過期預覽並要求重新預覽。
- 無觀察的推定邊界可調整；DENIED 保留為已記錄的否認，不以歷史修正洗掉未同步。未同步核對目標沿用 Ticket08 的重新核對保障。
- 單一 CORRECT_HISTORY 原子保存修正後 session 與 corrections 稽核資料；沿用 schemaVersion 1，新增選用 corrections 欄位，舊 envelope 仍可載入。MANUAL_RESET 只提供重播固定邊界支援，不新增 Ticket10 的重置入口。
- 同一目前週期的核對目標在修正後保留；原為同步但重播總數已與目標不符時改為 UNSYNCED，不保存矛盾的同步狀態。既有未同步紀錄仍需原目標、遊戲與工具數量相符後明確重新核對。

## Dependencies and Blockers

- Blocked by：05。

## Evidence

- Verification（工作目錄：repo 根目錄）:
  - 基準 `63381928bbcdd1369819c06b735ca80a864f2880`；Ticket08 已完成，開始時工作樹乾淨。
  - TDD：保存稽核與已確認邊界 15 顆載入先 RED，補上驗證後 GREEN；store 的預覽／套用／過期與失敗保存先 RED，整合後 GREEN。固定 USER_CONFIRMED_FULL／MANUAL_RESET 邊界在原有剩餘至少 15 且無舊 warning 時可修正的回歸先 RED、修正後 GREEN。
  - 最終 `npm run test`：11 files／137 tests passed；含 T20／T22／T31、推定邊界新增／移除／移位、後續修正與深度不可變、保留未同步目標、稽核載入及保存失敗不發布。
  - 獨立審查找到「原 SYNCED 且已核對，修改抽牌數後仍保留 SYNCED 造成重讀拒絕」與跨類型 ID 碰撞；主 Agent 補上保存／明確重核對 roundtrip 與三種 ID 碰撞回歸，先 RED 4 failed／33 passed、修復後 GREEN 37 passed。保存目標不符轉 UNSYNCED，修正與派生週期 ID 都檢查既有週期／回合／修正全集合。
  - `npm run lint`、`npm run typecheck`、`npm run build`、`git diff --check` 通過。核心最後調整另通過檔案級 ESLint 與嚴格 TypeScript 編譯。
  - `npm run e2e -- tests/e2e/history-correction.spec.ts --reporter=line`：桌機／375px 共 10 passed，覆蓋 T20／T22／T31、取消／Escape、欄位驗證、保存失敗、重讀與窄螢幕。
  - 最終 `npm run e2e -- --reporter=line`：桌機／375px 全量 96 passed（52.1s），0 failed／skipped；本次 production build 重建後執行。
  - reviewer 要求補上重載後實際開啟歷史及查看 audit 原因的斷言；僅測試增加斷言，`npm run e2e -- tests/e2e/history-correction.spec.ts --grep '已核對同步' --reporter=line` 桌機／375px 2 passed（1.5s）。工程實作未再變動。
  - `python3 /tmp/dv3-premium-audit.py /workspace/dv3-dito-web --mode strict --output /tmp/dv3-ticket09-premium-audit.json`：0 findings。
  - 瀏覽器檢查沿用 README 的 FONTCONFIG_FILE／PLAYWRIGHT_BROWSERS_PATH；初次整合發現關閉 dialog 攔截點擊，修正明確 closed 隱藏規則後 History E2E 通過。全量回歸另發現舊測試全頁文字 selector 匹配隱藏歷史文字，限定補滿觀察的 heading 後重新驗證。
- Delegation:
  - `g6-luna-max-core-engineer`（實際 `gpt-6-luna`／max）：reducer、純重播與核心單元測試；最後 owner 檢查 27 tests passed。
  - `g6-luna-med-engineer`（實際 `gpt-6-luna`／medium）：HistoryDrawer 與介面單元測試，7 tests passed。
  - 工具沒有命名參數，委派契約以固定角色名稱為正本，不使用隨機 nickname 作為角色或模型證據。
  - 主 Agent 負責 persistence／store／App 整合、E2E、文件與最終 Gate；角色路由目標 `g61-sol-med-orchestrator`，不由角色名稱推定 runtime 模型。
- Review / Audit：獨立 `g6-luna-max-deep-reviewer`（實際 `gpt-6-luna`／max，未參與施工）完成全量與增量補查，Standards PASS／Spec PASS，無剩餘 finding；主 Agent 最終 Gate 通過，可接受。本票 L2 未觸發正式 Independent Audit。
  - Scope：基準／審查時 HEAD `63381928bbcdd1369819c06b735ca80a864f2880`；`git diff --cached` 與基準至 HEAD committed diff 為空，review 涵蓋 `git diff` 的全部 Ticket09 修改，及 `git ls-files --others --exclude-standard` 的五個新檔完整內容。兩項資料一致性 finding 已修正，新增 E2E 開啟斷言亦經獨立補查。
  - 最終快照 SHA-256：`src/domain/historyCorrection.ts` 為 `62a4dd2bbcbb45576ed5221fc5fecdc392832bb0dde4f8cfceed111df35b93b1`，`tests/e2e/history-correction.spec.ts` 為 `168ef12368d4beb54dc5e296e6ca6e3bbe795a5c536176ac6df5a65d5b878131`；其餘原核心、persistence、store、App、HistoryDrawer 與首次全量審查快照一致，後續單元回歸亦納入補查。工程 15 檔 path→SHA256 sorted compact JSON 的整體 fingerprint `20de682189ad1a22bff032ae5821d990d8d4754eea02d2e06e5a95d8c6bff11a`，staging 前核對一致。
  - 獨立 `g6-luna-low-qa-runner`（`gpt-6-luna`／low）以 12 局 fixture 驗證最近十局與第二頁、modal 內鍵盤操作、Escape 草稿提示、套用後原局按鈕焦點與關閉後入口焦點；320／375／768／1440px 無水平溢位，檢查的操作目標至少 44px，繁中文字非零尺寸，page errors 0。命令為 README 的瀏覽器環境變數加 `node /tmp/historydrawer-qa.cjs`；結果與截圖在 `/tmp/dv3-dito-historydrawer-qa/`，主 Agent 已檢視 375px 截圖。這是 Chromium 模擬，未宣稱實體手機／螢幕閱讀器驗收；完整無障礙驗收仍屬 Ticket11。
- Skills：沿用 `cloud-environment-onboarding:setup`／`cloud-environment:cloud-environment-runtime` 的既有環境；本票開發採 `matt-skills-curated:implement`／`tdd`／`code-review` 與 `frontend-design-premium:frontend-design`／`frontend-design-premium:frontend-design-premium`，依 `docs/agents/skill-workflows.md` 適配唯一本地 Ticket 與 review 契約。本次無依賴或環境設定變更。
- Commit / PR：依 README standing authority 提交並推送 `work`，交付 SHA 與遠端核對結果於後續證據提交補記；沒有 PR、merge 或 deploy。
