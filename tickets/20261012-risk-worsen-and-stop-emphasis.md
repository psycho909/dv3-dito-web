# 熱條改看「變差」與「建議停手」醒目提示

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-12 Owner 回報「我已經抽到19/21為什麼 一般 爆牌0.00% 安全率100.00%?」及「『建議停手』警示訊息需要明顯」；已授權驗收通過即部署。
- Risk: L1（顯示語意與樣式；推薦與機率計算不變）
- Updated: 2026-10-12
- Branch: main
- Git / Remote authority: 依 README；不開 PR；Claude Code 驗收後推送 main 觸發 Vercel 自動部署。

## Goal

熱條警示反映「下一顆讓本局變差」的完整風險（爆牌＋A 改算 1 造成的降級），並讓「建議停手」在記牌時一眼可見。

## Background

Claude Code 於正式網站重現：A、8（軟 19）與 A、5、3 顯示「一般 爆牌 0.00% 安全率 100.00%」但建議停手。爆牌 0% 正確（A 會改算 1），但下一顆 3～9 會使點數降到 12～18（GREAT→GOOD／NORMAL），降級約 54%，熱條與建議互相矛盾。

## Scope

- 由現有 `calculateNextDraw` 的 `rankOutcomes` 推導（不改計算核心）：
  - 爆牌率：下一顆結果為 BURST 的機率（不變）。
  - 降級率：下一顆結果等級低於目前等級、且非 BURST 的機率；等級序 PERFECT > GREAT > GOOD > NORMAL。
  - 變差率＝爆牌率＋降級率；不變差率＝1－變差率。
- 熱條：填滿比例＝變差率；警示級別依變差率（< 30% 一般、30%～< 50%「注意」、≥ 50%「高風險」＋斜紋）。文字顯示「爆牌 X%」，降級率 > 0 時加「降級 Y%」，並以「不變差 Z%」取代「安全率」。兩位小數。已爆牌／已達 21／完成狀態維持 1.8.0 文案。
- 「建議停手」醒目：推薦為 STOP 時，分數板建議改為實心高對比標籤（較大粗體、使用既有 heat token、對比 ≥ 4.5:1，含 icon 或形狀提示，不只靠顏色）；「完成本局」按鈕切換為主要樣式並加醒目外框；`aria-live="polite"` 在轉為建議停手時播報一次；不使用持續或重複動畫（單次 ≤ 150ms 轉場可，reduced-motion 無動態）。點數鍵仍可操作。建議再抽時維持一般樣式。
- 版面：所有變化不改變首屏元素位置與高度（點數鍵不位移、三視窗首屏仍完整可見）。
- 升版 1.9.0（Changed／Fixed）；更新 DESIGN.md、UIUX 文件。
- 測試：單元測試以 A、8 滿牌池驗證爆牌 0%、降級 54%（27/50）、級別高風險；10、9 驗證爆牌 84%（42/50）、降級 0%；10、4 驗證 14 點時無降級；STOP／DRAW 樣式切換與 aria；e2e 375×667 截圖狀態、點數鍵不位移、無溢出。

## Out of Scope

- 推薦引擎、等級預估、得分。

## Acceptance

- [x] A、8 顯示爆牌 0.00%、降級 54.00%、高風險；10、9 顯示爆牌 84.00%、無降級。
- [x] 「安全率」改為「不變差」，數值＝1－變差率。
- [x] 建議停手時標籤與「完成本局」明顯強調，非僅顏色；建議再抽時恢復一般樣式。
- [x] 點數鍵不位移、三視窗首屏完整、375px 無溢出。
- [x] 頁尾 v1.9.0，版本紀錄含 1.9.0。
- [x] `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`npx playwright test` 全部通過。

## Constraints and Decisions

- 「變差」定義與停手強調樣式由 Claude Code 依 Owner 回報提出，可逆。

## Dependencies and Blockers

- 無。

## Evidence

- Verification: `npm run lint` exit 0（0 errors／0 warnings）；`npm run typecheck` exit 0；`npm test` 18 個檔案、230 項通過；`npm run build` 通過（132 modules transformed）；`npx playwright test` 132 項通過（mobile／desktop）。
- Review / Audit: 推薦引擎與 domain 計算核心未修改；局中指標由 `calculateNextDraw.rankOutcomes` 推導。STOP 熱度配色對比 4.5:1 以上，且只有 STOP 專用 polite live region 播報建議。
- Commit / PR:
- Claude Code 驗收（2026-10-12）: 審查 App.vue 推導（降級＝非 BURST 且 TIER_ORDER 位置低於目前等級；變差＝爆牌＋降級）。375×667 截圖：A、8 顯示 GREAT 50 分、紅色實心「建議停手」標籤、熱條「高風險 爆牌 0.00% 降級 54.00% 不變差 46.00%」、「完成本局」主要樣式＋外框；10、4 顯示「建議再抽」一般樣式、「注意 爆牌 46.00% 不變差 54.00%」；兩狀態點數鍵 y 皆為 324（無位移）。獨立重跑 lint 0 error、typecheck 0 error、unit 230/230、e2e 132/132。PASS。
- Commit / PR（Claude Code）: 依 README Git 授權 commit／push 至 `main`，觸發 Vercel Production 自動部署（Owner 授權驗收通過即部署）。
- Deployment: 2026-10-12 `138a8e9` Vercel 部署 success；正式網站 Chromium 375×667／1280×720 未登入驗證：頁尾 v1.9.0；A、8 爆牌 0.00%＋降級 54.00%＋建議停手；10、9 爆牌 84.00%＋建議停手；10、4 爆牌 46.00%＋建議再抽；完成本局皆在首屏；無頁面錯誤；安全標頭存在。
