# Ticket 11 視覺與無障礙驗收證據

2026-10-11，工作分支 `work`。正式驗收狀態與提交證據見 [Ticket 11](../../../tickets/20261008-11-visual-a11y.md)。本機 Chromium 模擬驗收，不是完整 WCAG 認證。

## 畫面與操作

五種寬度的 [320px](viewport-320.png)、[375px](viewport-375.png)、[768px](viewport-768.png)、[1024px](viewport-1024.png)、[1440px](viewport-1440.png) 是最終 production build、已記錄 4／7／6、17 點、49 顆牌池的穩定截圖。另有 [320px 空手牌](normal-empty-hand-320.png) 與 [320px 完整合法 52 顆手牌](max-legal-score-320.png)；最大合法分數為 340，分數與 BURST 徽章不重疊。

[browser-qa.json](browser-qa.json) 保存 `g6-luna-low-qa-runner` 的 viewport、控制尺寸、單一 h1、鍵盤流程、dialog 焦點、五級距與 reduced-motion 結果。模態覆蓋背景是預期遮罩，非一般區塊重疊。五張主截圖在最後 hover 配色修正後，由主 Agent 重新截取穩定狀態；QA 幾何與操作證據不因這兩行純配色變動重跑。

## 對比量測與限制

[contrast.json](contrast.json) 以 runtime token 的 sRGB 線性亮度公式 `(L亮+0.05)/(L暗+0.05)` 保存數值。ash／ash-muted 在 soot、anvil、anvil-raised 上最低分別 9.598／5.163:1；熱度圖形最低 NORMAL 3.116:1、BURST 3.259:1；BURST fill 對 soot 為 4.747:1。分數徽章最淺斜紋用 35% BURST 合成 anvil，ash 文字仍達 7.279:1。裝飾 seam／edge-light 不負責識別控制或傳達唯一資訊，不套用語意圖形門檻。

`tests/e2e/visual-a11y.spec.ts` 在真實 BURST、展開明細、非法備份錯誤、歷史抽屜與 320px 下讀取 computed styles，驗證可見文字至少 13px、4.5:1，啟用控制邊界與 BURST 圖形至少 3:1、控制至少 44×44；另操作 hover／mouse down 驗證點數鍵庫存文字仍達 4.5:1。取消歷史入口特例後先 RED，再修正為共同 control-edge；hover 的 seam 底亦先 RED，修正為 raised／anvil 後 GREEN。

這些是明確狀態／不透明表面的 CSS 與色彩合成量測，不是全站逐像素抗鋸齒掃描。disabled／inactive 控制依 WCAG 對比豁免，不宣稱其 opacity 合成文字達 4.5:1；目前的自動測試未遍歷所有 opacity／背景圖層。OS 檔案對話框、實體裝置、螢幕閱讀器及跨平台瀏覽器仍未驗證。

## 字型與動態

[font-geometry.json](font-geometry.json) 是 320px 下實際字型 `loaded` 與 CSS 字型 URL 改成不可取得後 `error` 的比較，空手與三次輸入狀態的分數寬度均為 151.15625px，面板與按鍵幾何一致，無重疊或溢出。Vite 將 1,848-byte 字型 inline 到 CSS，因此只攔截外部 `.woff2` URL 無法測出失敗；本次使用 CSS URL 替換證明 fallback。

來源、OFL、RFN 名稱與完整可執行重建指令見 [字型文件](../../../src/assets/fonts/README.md)。命令已實際執行，固定 subset 時間戳後重建 SHA-256 與出貨資產完全相同。正常抽牌動態 120ms；reduced-motion 的動畫與轉場設為 none，QA 的 animatedElements 為空。
