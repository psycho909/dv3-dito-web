# Ticket 12 本機 V1 整體驗收

正式狀態與授權見 [Ticket 12](../../../tickets/20261008-12-local-v1-acceptance.md)。基準 `ffe6cb3f271488b07785223c657314803cad2d3e`，分支 `work`，2026-10-11。此處區分已執行自動化、既有驗收證據與Owner已豁免且仍未執行的人工項目；不代表部署或含雲端的完整 V1 已完成。

## 可重現入口

在 repo 根目錄執行 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build`、`npm run e2e -- --reporter=line`。本環境沿用 README 的 npm cache、Chromium cache 與 fontconfig；本機使用正常作業系統字型及 Playwright browser cache。五項結果與原始 log 保存於 [gates](gates/README.md)／[results.json](gates/results.json)，沿用證據與新執行結果逐項標示。

新增 [local-v1-acceptance.spec.ts](../../../tests/e2e/local-v1-acceptance.spec.ts) 已在桌機與375px兩個專案通過（2/2）；[journey](journey/) 保存兩份 runtime JSON、離線分布與未同步截圖。整合流程使用既有 Playwright；不修改產品或引入依賴。斷網時完成 4／7／6、撤銷、完成與換局，再恢復連線重新整理、核對不符並保持原牌池。僅證明已載入頁面可在離線狀態計算與保存，不保證第一次開啟或離線重開，沒有 PWA／service worker／雲端佇列驗收。

## 非雲端驗收對照

以下入口的 runtime 結果由 gates 的全量 E2E 與各前置 Ticket 保存。自動化模擬能驗證尺寸、狀態與互動，不能驗證真實手指的單手可達性、人體操作感受或螢幕閱讀器。

| UIUX §11 項目 | 可重現入口／證據 |
| --- | --- |
| 320／375／768／1024／1440 無水平溢出、按鈕可點 | `record-draw.spec.ts`、`visual-a11y.spec.ts`；[Ticket 11 五種截圖及量測](../ticket11/README.md) |
| 手機同頁十種點數、撤銷、五種結果 | `record-draw.spec.ts`、`round-actions.spec.ts`；375px 行動專案，人工單手未測（Owner已豁免門檻） |
| 4／7／6：17/21、49、五種正確百分比 | `record-draw.spec.ts` 固定整數分子 3／8／4／0／34，分母 49；顯示 6.12／16.33／8.16／0.00／69.39% |
| 逐點數庫存、機率、分數、級距 | `rank-deck-detail.spec.ts` 逐一核對十種結果 |
| 用罄不能選、撤銷恢復 | `record-draw.spec.ts`、`round-actions.spec.ts` |
| 完成→新局仍49且空手牌 | `round-actions.spec.ts`；斷網整合流程 |
| 15 不補、14 下一局才補 | `refill-cycle.spec.ts` 兩個門檻案例與觀察提示；`local-persistence.spec.ts` 重載邊界 |
| 重載、匯入匯出、歷史修正回饋 | `local-persistence.spec.ts`、`backup-management.spec.ts`、`history-correction.spec.ts` |
| UNSYNCED 不顯示精確主卡與推薦 | `verify-remaining.spec.ts`、`refill-cycle.spec.ts`；斷網整合流程 |
| 斷網不影響計算；本機提示與牌池狀態區分 | 斷網整合流程；目前僅本機，不驗收雲端 BACKED_UP／OFFLINE_PENDING |
| 鍵盤、focus、對比、reduced-motion | `round-actions.spec.ts`、`rank-deck-detail.spec.ts`、`verify-remaining.spec.ts`、`visual-a11y.spec.ts`；[Ticket 11](../ticket11/README.md) |
| 百分比來自 domain | [domain/index.ts](../../../src/domain/index.ts)、[App.vue](../../../src/App.vue)、[ProbabilityBreakdown.vue](../../../src/components/ProbabilityBreakdown.vue)；unit 固定範例與整數計數不變量 |

雲端提示、匿名身分／Email、斷線佇列、雙裝置衝突及覆寫保護仍未實作／未驗收，對應 S1～S5；UIUX 的相關核取方塊保持未勾選。

## 人工驗收：Owner已豁免，步驟保留供日後選用

2026-10-11（Asia/Taipei）Owner 指示「人工驗收步驟跳過，進下一階段」，本票以豁免人工門檻結案。以下仍 **未執行**，不記為 PASS。使用獨立測試資料，勿清除日常紀錄；先匯出重要資料。記錄日期、測試 commit、裝置／作業系統、瀏覽器版本、畫面寬度、操作方式及每項實際結果。手機需用實體裝置單手操作；桌機需包含鍵盤 Tab／Enter／Escape。

1. 確認從52開始，輸入4、7、6：17/21、剩49，五種百分比應為6.12／16.33／8.16／0.00／69.39%。手機觀察鍵盤、數字及機率是否可讀、不重疊；十種點數鍵與撤銷是否能單手點到。
2. 撤銷6：11/21、剩50；再輸入6。展開逐點數明細與牌池抽屜，關閉後回到原按鈕；桌機確認 Tab focus 可見、Escape 正常。
3. 完成對話框先取消，再確認完成；開始新局：0/21、空手牌、仍剩49。重新整理應保留新局、舊局與庫存。
4. 在「核對遊戲剩餘顆數」填48：出現未同步警示，工具原紀錄仍剩49，主卡百分比與推薦隱藏。只補記已知遺漏點數後再核對，不靠差額猜點數。此為合成錯誤操作，不宣稱真實遊戲已漏記。
5. 另用獨立合成測試紀錄測15／14門檻：從52開始，A～9各輸入4次，再輸入一次10，共消耗37、剩15；完成→新局仍15、不問補滿。新局再記一顆10，剩14、局中不補滿；完成→新局才52並詢問觀察，回答「不是」應未同步、隱藏精確百分比。這段是軟體測試資料，不能證明遊戲允許爆牌後繼續抽取，也不代替實地規則觀察。
6. 匯出備份、預覽合法匯入並取消，確認原資料不改；以合成資料測一次覆蓋還原及歷史修正。記錄是否有無法點擊、文字遮擋或錯誤焦點問題。

待回填結果：桌機 **未測**；手機 **未測**；單手可達性 **未測**。發現問題附操作順序與預期／實際；若日後執行再回填實際結果；D1前置阻塞已由Owner豁免解除。螢幕閱讀器、實體裝置跨瀏覽器及 OS 檔案對話框沒有本次自動化證據。
