# D2 Production 驗證（2026-10-12）

- PR： https://github.com/psycho909/dv3-dito-web/pull/2 ，正常 squash merge，未繞過保護；head 629c9d4a94480b8daa7b03ef087e09281a34b588，main ff86f9641da2fd6108b45f443b92c75fe50664b7。
- Vercel project：prj_3mBC03C7BzuEyMj3fijOMoc8wIpX，psycho909s-projects/dv3-dito-web。Connector 404，既有 authenticated CLI 成功，未新建專案。
- `vercel ls dv3-dito-web --scope psycho909s-projects --prod --json` 確認新部署 Git metadata main／ff86f9641da2fd6108b45f443b92c75fe50664b7。
- `vercel inspect https://dv3-dito-web.vercel.app --scope psycho909s-projects --json` 確認 dpl_7vehwtXEoRVGRBvZ2PH5QLn6PpcE／READY／production，正式 alias 指向 dv3-dito-7teyjh4dy-psycho909s-projects.vercel.app。
- Production env 已有 VITE_SUPABASE_URL、VITE_SUPABASE_PUBLISHABLE_KEY；沒有新增 Cloudflare 或 secret env。S1 migration 已套用，不重複套用。
- 正式 runtime：1280px／375px 新 Chromium context、未登入；本機 4／7／6、17/21、重載保留、建議停手、登入入口、無水平溢出／pageerror 全 PASS。首頁 200、缺失 asset 404、CSP 允許指定 Supabase project；實際 bundle 包含新衝突／刪除 UI，未發現 service_role／private key 標記。
- 機器結果：[production-smoke.json](production-smoke.json)；[桌機](production-1280.png)／[手機](production-375.png)。
- 雲端完整流程：unit 198、E2E 116 全通過，後者攔截 Supabase API；S1 真實本機 pgTAP 50、RLS 與雙連線證據沿用。
- 未執行：正式雲端 CRUD、實體手機、其他 browser。Owner 已實測正式 GitHub 登入／登出／重載保留；本次未重新登入，不建立正式合成帳號或紀錄。bundle 標記檢查不能保證偵測所有任意 secret 字串。

- 補充實際 Production JS 掃描：service_role、SUPABASE_SERVICE_ROLE_KEY、BEGIN PRIVATE KEY、postgres(?:ql)?://、SUPABASE_DB_PASSWORD、PGPASSWORD、DATABASE_URL 共七種標記零命中；結果存 production-smoke.json 的 secretMarkerScan。僅證明這些標記未出現，不能辨識任意裸密碼。
