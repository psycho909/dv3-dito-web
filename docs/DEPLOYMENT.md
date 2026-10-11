# D1 Vercel 本機版部署

正式狀態與權限見 [D1 Ticket](../tickets/20261008-D1-vercel-local-deploy.md)。Owner提供的既有專案：[psycho909s-projects/dv3-dito-web](https://vercel.com/psycho909s-projects/dv3-dito-web)。Dashboard網址不是已驗證的應用網址；目前Preview／Production URL皆待實際部署回填。

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

## 既有專案的部署順序

Owner於2026-10-11確認「git merge到main就會自動部屬」。此資訊由Owner確認，平台設定API尚未讀取；本次採既有Git integration，合併並推送main觸發既有專案部署，不需Vercel token或CLI project link。

1. 完成本機build、lint、產物與合成CSP browser檢查及獨立Review；fetch核對遠端main與待合併分支。main為祖先時使用fast-forward，保留完整歷史，不force push。分支保護由遠端正常push強制；若拒絕則保留commit並停止，不繞過規則或自動改走未授權PR。
2. 推送work保存來源，再合併到main並推送origin/main。Owner此指示將發布流程改為直接由main觸發Production；沒有實際Preview URL／測試時仍保留Preview驗收未執行。
3. 保存遠端main SHA；從既有Vercel dashboard或可用GitHub deployment紀錄取得實際部署狀態、SHA與應用URL。推送成功只證明已送出觸發來源，不能代替hosted build成功。
4. 在實際網址檢查桌機／375px的4／7／6、撤銷、完成、新局、重載及JSON還原，HTTP安全標頭與缺失asset 404。記錄實際URL、SHA與結果；存取保護使用合法方式，不繞過。

先前保存的VERCEL_TOKEN草稿只是未套用的API替代方案，本Git流程不需要填入或發布該需求。GitHub部署API目前回覆Forbidden；不藉此推論Git推送失敗，也不猜測vercel.app網址。

## 狀態與限制

Ticket12人工門檻已由Owner於2026-10-11明確豁免；未測項仍未測，不影響進入D1準備。D1的hosted Preview／Production驗收仍需實際部署紀錄與應用URL；不因本機CSP或產物檢查通過而accepted。此版僅本機localStorage；更換origin／裝置不會自動搬移資料，先從原origin匯出再匯入。沒有PWA首次離線啟動保證、雲端備份、RLS或Email恢復；它們由S1～S5／D2處理。
