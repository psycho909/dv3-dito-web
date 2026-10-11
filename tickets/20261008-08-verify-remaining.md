# 08 與遊戲核對剩餘數

- Status: done
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-11
- Branch: work
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

玩家輸入遊戲顯示的剩餘數；不一致時工具明確標示牌池未同步，不再顯示精確機率與推薦。

## Scope

- FR-06：VERIFY_REMAINING 事件、UNSYNCED 狀態與恢復路徑（撤銷、修正紀錄、等待重補滿重新同步）。
- UI：核對入口、UNSYNCED 時主機率卡改為阻擋狀態、推薦隱藏。
- 測試：T16、AC-06。

## Out of Scope

- 歷史修正本身（09）。

## Acceptance

- [x] 輸入 3 顆但遊戲顯示 48 → UNSYNCED，不顯示精確 % 與推薦；補上遺漏點數並重新核對當下遊戲數量後恢復。
- [x] 不會用剩餘總數差額自動扣除任何點數。

## Constraints and Decisions

- `SyncState` 與雲端備份狀態完全獨立。
- 不一致時保存核對目標，補記已知遺漏點數或撤銷誤記後仍保持 UNSYNCED，重新輸入當下遊戲剩餘數並確認「原目標＝新回報＝工具總數」才恢復；既有補滿否認不會因總數相同而恢復可信度。
- 既有不一致不能只靠再次輸入相同工具總數洗掉；必須修復原始紀錄或在合法新週期確認遊戲補滿。
- UNSYNCED 期間的原目標固定；其他相符或不相符的回報都不能覆寫。遊戲數量已改變而無法修復原紀錄時，等待合法新週期確認補滿。
- 本票提供核對、補記與既有撤銷／補滿觀察路徑；歷史修正及匯入／重置入口依後續 Ticket 09／10。

## Dependencies and Blockers

- Blocked by：05。

## Evidence

- Verification: 2026-10-11 最終恢復流程修正後，`npm run lint`、`npm run typecheck`、`npm run test`（107/107）、`npm run build` 通過。
  - `FONTCONFIG_FILE=/workspace/shared/dv3-dito-fonts.conf PLAYWRIGHT_BROWSERS_PATH=/tmp/dv3-dito-web-playwright-browsers npm run e2e -- --reporter=line`：恢復流程修正後 mobile 與 desktop 共 84/84 通過（50.0s）；再修正原目標不可覆寫後，核對與保存受影響套件兩裝置重驗 30/30 通過（11.9s）。核對案例涵蓋 4、7、6 → 核對 48 → 重載未同步 → 補記 2 → 仍未同步 → 重新核對 48 → 同步，以及無效輸入、鍵盤送出與撤銷修復。
  - 核對 summary 至少 44px，由瀏覽器 bounding box 斷言驗證；輸入、核對按鈕皆至少 44px。UI strict audit `/tmp/dv3-premium-audit.py`：0 findings；`git diff --check` 通過。
  - `g6-luna-low-qa-runner`（實際 `gpt-6-luna` / low；agent `01a1296c-4b0e-7495-80e8-7241beee6080`）唯讀 QA 375/1440px 無橫向溢位與 page error；截圖 `/tmp/ticket08-qa-375.png`、`/tmp/ticket08-qa-1440.png` 是恢復流程及 summary 修正前快照，最終行為與尺寸由 E2E 實測驗證。
  - 前輪工程委派 `g6-luna-max-core-engineer`／`g6-luna-med-engineer` 因模型額度停止，草稿由主 Agent 接手完成；本輪 QA 與獨立 review 使用依命名規則指定的角色及明確模型／effort。未測實體手機、真實遊戲補滿規則或雲端功能。
- Review / Audit: 獨立 `g6-luna-max-deep-reviewer`（實際 `gpt-6-luna` / max；agent `01a1296b-d4bb-7334-b290-ec598960d086`，未參與施工）完成 Standards 與 Spec 檢查，限定重查後 Spec PASS，無剩餘 finding。主 Agent 最終 Gate 接受。
  - Scope：基準與審查時 HEAD 均為 `7f90f16696c5c8a29e0222e404addf4d415744f0`；`git diff --` 涵蓋本票所有 tracked 修改，`git ls-files --others --exclude-standard` 及完整讀取涵蓋 RemainingVerification 元件、單元測試與核對 E2E 三個新檔。無先前提交差異；最終 staging 另以 `git diff --cached` 核對交付內容。
  - Findings：① 修補輸入總數偶合舊目標會自動恢復，改為重新核對當下遊戲數量；② 不匹配的新回報可覆寫原目標，改為 UNSYNCED 原目標固定。第二項新增回歸先 RED 重現，再 GREEN 通過。
  - 重查命令：`nl -ba src/domain/gameReducer.ts`、`nl -ba src/services/persistence.ts`、`nl -ba tests/unit/gameReducer.test.ts`、`nl -ba tickets/20261008-08-verify-remaining.md` 限定對應段落，及 `git diff --check`；reviewer 不重跑主 Agent 測試。最後 help 文案、Ticket 證據及 TODO 結案由主 Agent 文件核對，不稱為獨立 review。
  - 最後 help 說明加入後 `npx eslint src/components/RemainingVerification.vue`、`npx vue-tsc --noEmit -p tsconfig.app.json`、build 與核對 E2E 6/6 通過；不再更動 runtime。未觸發正式 Independent Audit。
- Commit / PR: 已依 README standing authority 交付至 `work`；實作 commit 與遠端核對記錄於交付追加紀錄。不含 PR、merge、deploy。
