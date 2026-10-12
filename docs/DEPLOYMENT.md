# D1 Vercel 本機版部署

正式狀態與權限見 [D1 Ticket](../tickets/20261008-D1-vercel-local-deploy.md)。Owner提供的既有專案：[psycho909s-projects/dv3-dito-web](https://vercel.com/psycho909s-projects/dv3-dito-web)。正式網站：https://dv3-dito-web.vercel.app/ 。2026-10-11已核對Production與Preview來源0814600、Ready狀態及hosted驗收，證據見 [hosted驗收](verification/D1/hosted/README.md)。

## 專案設定

Root Directory為repo根目錄；Framework為Vite；Build Command為 `npm run build`；Output Directory為 `dist`。沿用lockfile與 `npm ci`，不加入Supabase或VITE_*秘密。`vercel.json`保存部署設定與安全標頭；應用未採用history router，不添加任意路由到index的fallback。缺失asset應保持404，避免把HTML當JavaScript。

本環境以Node24.19.0驗證；README的本機前置需求為Node22.14.0。Vercel建置時須核對專案實際Node設定與build log；本機成功不代替hosted build成功。部署只發布dist的靜態產物，不公開repo內規則參考圖。

## 本機驗證

```bash
npm run build
node scripts/verify-deployment-artifact.mjs
npm run lint
```

產物檢查驗證預期路徑、index資產引用與常見憑證檔名；它不保證偵測任意JavaScript／CSS中的所有密鑰。Vite會將VITE_*環境變數內嵌，勿放入token、service-role或私鑰；D1不需要應用秘密。

本機合成CSP標頭下的Chromium流程證據見 [D1 verification](verification/D1/README.md)。Vite preview本身不套用vercel.json，故這項QA明確將設定中的headers注入document response，驗證瀏覽器真正強制政策，不冒稱Vercel平台已套用。

## 版本號與版本紀錄

`package.json` 的 `version` 是目前網站版本的唯一來源；升版時同步更新 `package-lock.json`。`CHANGELOG.md` 是網站版本紀錄的唯一內容來源，使用 `## [x.y.z] - YYYY-MM-DD` 與 `### Added`／`### Changed`／`### Fixed` 格式。Vite 會從 package 版本注入頁尾，並在啟動／建置時檢查 CHANGELOG 格式及最新發布版本是否相符。

每次含使用者可見變更推送 `main` 發布前，新增對應的 SemVer 版本與日期區段，再執行測試與 production build；純文件或測試變更不升版。`[Unreleased]` 維持空區段，版本紀錄對話框只顯示已發布版本。

## 既有專案的部署順序

Owner於2026-10-11確認「git merge到main就會自動部屬」。此資訊由Owner確認，本次已以Dashboard、現有CLI與build log核對main部署；本次採既有Git integration，合併並推送main觸發既有專案部署，不需Vercel token或CLI project link。

1. 完成本機build、lint、產物與合成CSP browser檢查及獨立Review；fetch核對遠端main與待合併分支。main為祖先時使用fast-forward，保留完整歷史，不force push。分支保護由遠端正常push強制；若拒絕則保留commit並停止，不繞過規則或自動改走未授權PR。
2. 推送work保存來源，再合併到main並推送origin/main。Owner此指示將發布流程改為直接由main觸發Production；沒有實際Preview URL／測試時仍保留Preview驗收未執行。
3. 保存遠端main SHA；從既有Vercel dashboard或可用GitHub deployment紀錄取得實際部署狀態、SHA與應用URL。推送成功只證明已送出觸發來源，不能代替hosted build成功。
4. 在實際網址檢查桌機／375px的4／7／6、撤銷、完成、新局、重載及JSON還原，HTTP安全標頭與缺失asset 404。記錄實際URL、SHA與結果；存取保護使用合法方式，不繞過。

先前保存的VERCEL_TOKEN草稿只是未套用的API替代方案，本Git流程不需要填入或發布該需求。Vercel connector曾回覆404／403，現有CLI與Dashboard可讀取；不藉此推論Git推送失敗，也不猜測vercel.app網址。

## 狀態與限制

Ticket12人工門檻已由Owner於2026-10-11明確豁免；未測項仍未測。D1已完成hosted Production桌機／375px、備份還原、headers／資產檢查及Preview跨局驗收。實體手機與其他瀏覽器未測。此版僅本機localStorage；更換origin／裝置不會自動搬移資料，先從原origin匯出再匯入。沒有PWA首次離線啟動保證、雲端備份、RLS或Email恢復；它們由S1～S5／D2處理。

## D2 GitHub 雲端版（2026-10-12）

Owner 指示 S4／S5 完成後一起發布，採 PR #2 正常 squash merge 至 main，觸發既有 Git integration。Production 已 READY，main ff86f9641da2fd6108b45f443b92c75fe50664b7；專案與 alias、runtime 證據見 [D2 驗證](verification/D2/README.md)。

Vercel Production 使用公開 VITE_SUPABASE_URL 與 VITE_SUPABASE_PUBLISHABLE_KEY；Auth GitHub Provider 與正式回跳已設定，首次備份需玩家明確確認。沒有 Cloudflare／匿名登入／Email。S1 migration 已在指定正式 Supabase 套用；發布不再套用 SQL。服務不可用時先保存本機與佇列，恢復後重試；配額仍由 Supabase Dashboard 監看，不增加自動清理或付費服務。

雲端備份、選版、墓碑與刪除的完整旅程以 mocked API E2E 及本機 DB 驗證；正式網站只驗證未登入本機記牌與資產／標頭，未建立正式合成資料或實測正式 CRUD。未登入或未啟用備份仍可本機使用。
