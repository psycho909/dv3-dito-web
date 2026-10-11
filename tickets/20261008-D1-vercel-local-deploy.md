# D1 Vercel 部署本機版

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 確認「網頁會在 Vercel 部屬」（部署平台決策）；2026-10-11 Owner指示「人工驗收步驟跳過，進下一階段」，接續D1準備與部署流程；Owner已提供目標專案 https://vercel.com/psycho909s-projects/dv3-dito-web ，Owner接著確認「git merge到main就會自動部屬」
- Risk: L2
- Updated: 2026-10-11
- Branch: main
- Git / Remote authority: 依README commit／push work；Owner本次要求進下一階段並提供既有Vercel專案，依最新指示合併並推送main，由既有Git integration觸發此專案Production；不含PR／自訂網域。

## Goal

把本機版 V1 以靜態 SPA 部署到 Vercel，玩家可用網址開啟並在手機上使用。

## Scope

- Vercel 專案設定（Framework Vite、build 指令、輸出目錄）；SPA 路由 fallback 設定（若使用 history mode）。
- Owner於2026-10-11改為合併／推送main自動Production；Preview未執行仍須如實保留。
- 安全標頭（CSP、`X-Content-Type-Options`、`Referrer-Policy`）的最小設定。
- 確認 `docs/references/` 截圖不在部署產物內。
- README：部署方式與網址。

## Out of Scope

- Supabase 環境變數（D2）、自訂網域（需另行決定）。

## Acceptance

- [x] Preview 網址在桌機與375px手機寬度完成一次 4/7/6 跨局流程（瀏覽器模擬，非實體手機）。
- [x] 部署產物不含 `docs/references/` 與任何密鑰（既有產物檢查、線上三檔SHA256一致；不宣稱能偵測任意秘密字串）。
- [x] Production 網址可開啟，README 已記錄。

## Constraints and Decisions

- 部署平台：Vercel（Owner 決定）。
- 目標既有專案：`psycho909s-projects/dv3-dito-web`，Owner於2026-10-11提供 dashboard URL；不得另建或部署到其他team／專案。
- Owner確認main自動部署；使用Git推送，不需Vercel token。平台設定與hosted成功仍需實際紀錄核對。

## Dependencies and Blockers

- Ticket12已依Owner明確人工門檻豁免accepted，前置阻塞解除。
- Vercel token草稿未套用，本Git流程不需要填入／發布。先前GitHub deployment API回覆Forbidden；本次已透過Dashboard與現有CLI取得真正URL及Ready紀錄，阻塞解除。

## Evidence

- Verification：開始HEAD `e72eb2f24edb396bf7ab06350ae02e026fe68e09`，工作樹乾淨；新增部署設定與產物檢查，不改產品、依賴或lockfile。本次production build成功75modules、3檔；node scripts/verify-deployment-artifact.mjs通過，npm run lint exit0；local合成CSP桌機／375px Chromium 2passed（2026-10-11T11:17:57Z），字型、動態bar、撤銷、跨局、Blob下載／匯入／reload均通過，無CSP violation／pageerror；本機證據不代表Vercel部署成功。
- Credentials／設定：本次檢查VERCEL_TOKEN、VERCEL_PROJECT_ID、VERCEL_ORG_ID均未設定；CLI不在PATH、已知CLI auth位置與.vercel/project.json不存在；runtime當次無secret binding。Owner提供目標專案URL。已保存VERCEL_TOKEN個人需求草稿（status saved、requires_publish true）並加入api.vercel.com目的地；未宣稱已套用或有Vercel API權限。最新Git部署流程不需要此token需求，不要求Owner填入或發布。
- Delegation：固定角色g6-luna-med-engineer（spawn gpt-6-luna／medium）負責vercel.json及產物檢查script；g6-luna-low-qa-runner（同模型／low）負責本機注入headers的browser流程與JSON／log。QA harness由g6-luna-med-bug-fixer修count解析，再由g6-luna-max-bug-fixer定位初始17點／新局0點expected混用並修正；最終runtime由Main整合執行。無name參數，以契約角色名為正本，不用自動nickname推測模型。
- Review / Audit：獨立g6-luna-med-reviewer（spawn gpt-6-luna／medium，未參與施工）已檢查Standards／Spec；涵蓋e72eb2f基準的unstaged及新增檔（staged空），原16path指紋2ddd6bd8cfdc69529020f1340b39ece161a61dc0a5d2163e8e5a07f439f4b6a4。增量review確認Owner main授權與正常push保護等價控制，狀態格式finding已修正；最終QA證據增量review通過，reviewer核對17點／新局0點獨立預期、CSP enforcement、字型、JSON下載還原與2passed raw log；四份runner snapshot與執行source逐byte一致。可正常fast-forward／push；截至前輪hosted未核對，當時D1維持blocked；本次已補齊hosted證據。
- 前輪未執行（截至當時；本次hosted證據見結案段落）：真正VercelPreview／Production發布、平台headers／部署Protection、平台讀取專案repo link／Production branch／Node設定（main自動部署已有Owner確認，尚非API核對）、實體手機與跨平台瀏覽器。Owner豁免只解除Ticket12人工門檻，不豁免D1真正網址驗收。
- Commit / PR：本輪可驗證成果依README standing authority提交／推送work並核對遠端；完成本機與獨立Review後依Owner最新指示合併／推送main，記錄遠端SHA；不建立PR。

- Schema依據：官方npm vercel@63.1.2，tarball SHA256 `d0f688e150204c24a09d41e3370062ea8a9413f579488ea76ef54362fe427cd7`；主要build設定／headers結構與vite slug依發布包查核，證據見 docs/verification/D1/schema-source.json，不冒稱完整hosted validation。官方網站403後改用允許的npm registry，沒有繞過proxy或改TLS。

- Git交付：本輪部署來源合併／推送origin/main，使用fast-forward、一般push；遠端拒絕即停。同步結果由Git遠端HEAD與push回報核對，不把觸發來源送出視為Vercel部署已成功。Remaining blocker僅hosted部署紀錄／實際應用URL與驗收。

- 遠端收據（2026-10-11）：`2b5c1385ae48fb4205ed88f864b7a9edd8d5f2da`已由work fast-forward合併main，正常push成功；fetch確認HEAD、origin/main、origin/work相同且工作樹乾淨。依Owner確認的Git integration已送出部署觸發來源。Dashboard讀取遭proxy CONNECT 403，GitHub deployment API Forbidden，故無hosted狀態／URL證據，不宣稱部署成功。此收據文件追加亦依相同正常Git流程同步，最新部署SHA以origin/main為準。


- Hosted結案（2026-10-11 Windows Session，Owner「開始繼續下一步」）：Dashboard／現有CLI核對同一既有project、Production／Preview Ready與0814600來源。正式URL https://dv3-dito-web.vercel.app/ ，Production兩項Chromium流程passed、實際headers與三檔SHA256一致、四個不存在路徑404；Preview既有登入桌機／375px跨局及reload完成。原始logs／JSON／截圖與可重現source見docs/verification/D1/hosted/README.md。D1 accepted，handoff done；先前未執行列表為當時紀錄，以上本次證據補齊platform／hosted部分。實體手機、其他瀏覽器仍未測。
- 工具與Skill：vercel:deployments-cicd、vercel:verification、vercel:access-protected-vercel-deployment；現有CLI fallback取得project／build log，沒有修改平台設定或重部署。npm ci回報既有19項弱點，未升級或分析可利用性；不視為安全稽核通過。
- 本次獨立Review：collaboration.spawn_agent以fork_turns=none、gpt-6-luna／max（User固定worker設定）建立未參與施工context。Scope為0814600基準／HEAD、空staged、6個tracked修改與hosted所有new files；Standards／Spec可接受。Preview證據缺口經逐筆原生viewport/runtime資料補正，最終review確認desktop 6筆1280×720、mobile 6筆375×812與完整跨局流程，無阻擋finding；CUA跨tab screenshot限制已明示，不以重複窄圖佐證desktop。npm run lint exit0、git diff --check exit0；刪unused helper與http import/global修正屬非行為變動，未重跑已通過產品unit／全量E2E。此段純結案證據由Main核對。
