# D1 hosted驗收（2026-10-11）

## 已驗證

- Production：https://dv3-dito-web.vercel.app/ ，deployment `dpl_5tkfCqmuc3E7Ej1SAPWaXcJ5mGfS`；Dashboard／CLI均Ready，main來源`08146000ad7440bb9940cbad7056f7844ea3519a`。build.log記錄Vite 75 modules、三檔dist與部署成功。專案CLI Node設定24.x；專案預設Other由vercel.json的Vite／build／dist設定覆蓋，實際build log及線上雜湊已確認。
- Preview：deployment `dpl_J93V9REAtZGjaiLzJ1AY3ZRpoti4`，Dashboard Ready／work來源相同SHA。桌機使用 https://dv3-dito-i6uhi49kb-psycho909s-projects.vercel.app/ ，375×812使用 https://dv3-dito-web-git-work-psycho909s-projects.vercel.app/ 。經既有登入的Codex in-app browser手動自動化操作：52→4／7／6→17／21、剩49，五級6.12／16.33／8.16／0.00／69.39%，撤銷→11／21、重記6、完成→新局0／21仍剩49、重載保留。兩個origin初始皆未初始化，未覆蓋既有玩家資料；記錄為UI觀察，非Playwright測試結果。
- Production Playwright：桌機1280×720與375×812兩項passed，實際platform headers、五級分布、字型與bar、撤銷／跨局、JSON實際下載、清除隔離測試context、file input匯入、重載還原通過，無pageerror／CSP violation。source從既有D1 runner改成hosted，移除route.fulfill；不改產品或lockfile。報告與四張截圖在本目錄。
- `node docs/verification/D1/hosted/http.mjs`：三個線上artifact SHA256與既有dist-manifest一致，document／JS／CSS的CSP、nosniff與Referrer-Policy符合vercel.json；missing asset、docs/reference sample、.env、README.md均404。原始結果http.json。

## 重現

在repo根目錄執行：

```powershell
npm ci
npx playwright install chromium
npx playwright test --config docs/verification/D1/hosted/playwright.config.ts
node docs/verification/D1/hosted/http.mjs
```

Production測試使用隔離browser context及合成記牌資料，不讀寫玩家現有瀏覽器。npm ci沒有變更lockfile。browser-install-pending.log為第一次在browser安裝尚未完成時啟動失敗的紀錄；安裝完成後重跑成功，後續改善跨reload CSP收集後再跑的最終結果見run.log。不把未啟動測試算成產品失敗或PASS。

## 限制與風險

- 未測實體手機、Safari／Firefox、實際遊戲規則、PWA首次離線或Supabase；375px為模擬。產品僅localStorage，同origin之外需JSON搬移。
- connector讀取目標專案404、部署403；現有Vercel CLI 61.0.0與已登入Dashboard成功取得同一目標，未修改專案設定、未重部署或建立新專案。Preview原始HTTP導向SSO，`vercel curl`依現有CLI身份取得200；CLI自動產生此project的protection bypass token，未輸出／提交token，本次browser使用既有登入，未弱化Protection。
- npm ci回報既有19項弱點（3 moderate／14 high／2 critical），未執行audit fix或升級；本次未分析可利用性，不能當成安全稽核通過。
- SHA256一致與已知檔名檢查不保證辨識任意secret字串。Dashboard Ready／build成功與實際HTTP、瀏覽器流程分別保存，不以Git push取代部署驗收。
- 後續文件push會再次觸發main部署；本報告驗證的是0814600產物，新增文件／QA source不改src、public、依賴或vercel.json。新的Ready結果另由交付時CLI核對。

## Preview增補原始證據

獨立Review指出Preview原始佐證缺口後，Main以IAB再次操作相同兩個origin並保存preview-steps.json（原生UI讀取、expected score/count assertion、12個時間點，逐筆保存window.innerWidth／innerHeight）、兩張preview-mobile-*.jpg與兩份DOM snapshot。復測前手動重置僅用本輪Main建立的合成測試session，保留舊歷史、不刪資料；建立新52週期後476→17/21剩49、撤銷→11/21剩50、重記→完成→新局→reload仍0/21剩49。桌機viewport明確1280×720、手機375×812；這是可核對UI自動化紀錄，仍不計為Playwright 2passed的一部分。

CUA screenshot API在桌機與手機tab回傳相同影像，無法用其獨立證明viewport；刪除誤標desktop的重複JPG，不把窄圖當桌機證據。Preview桌機／手機尺寸以每筆原生DOM window.innerWidth／innerHeight讀值及分步runtime state為準；DOM snapshot只佐證內容，不佐證寬度。
