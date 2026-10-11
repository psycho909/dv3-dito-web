# Task Handoff

## Identity
- Task: D1 Vercel本機版部署
- Authority / Ticket: tickets/20261008-D1-vercel-local-deploy.md
- Status: blocked
- Updated: 2026-10-11
- Source environment: Codex cloud /workspace/dv3-dito-web
- Branch: work
- Remote: origin（https://github.com/psycho909/dv3-dito-web.git）
- Base commit: e72eb2f24edb396bf7ab06350ae02e026fe68e09
- Working tree: 本次可驗證部署設定、文件、證據與handoff會一起提交；接手核對最新HEAD／origin/work及工作樹。
- Sync target: origin/work、origin/main

## Goal and Acceptance
見D1正式Ticket。目標既有專案 https://vercel.com/psycho909s-projects/dv3-dito-web ，Owner最新指示以main合併／推送觸發Production，Preview未執行如實保留；不另建專案或跨team部署。

## Completed
- Owner明確豁免Ticket12人工門檻，已accepted且handoff done，未測項未改寫PASS。
- D1本機Vite部署設定／安全標頭與產物檢查；實際最終結果見正式Ticket及docs/verification/D1/。
- 部署指南、目標專案與未部署限制；.vercel/只本機忽略。
- VERCEL_TOKEN個人需求草稿已保存，唯一新增API目的地api.vercel.com；token未寫入聊天或repo。

## Remaining
部署來源以work及main同步；仍需取得實際Production URL／部署紀錄，執行hosted流程與HTTP headers驗證。

## Decisions
只發布dist；無history router所以不新增SPA fallback。CSP允許現有動態style、dataURIfont／mask，禁止外部script與unsafe-eval。合成本機headers不能替代平台headers。owner豁免人工不等於Vercel部署驗收通過。

## Changed Files
vercel.json、scripts/verify-deployment-artifact.mjs、.gitignore、README、docs/DEPLOYMENT.md、D1驗證資料、Ticket12豁免與D1狀態、TODO、兩個handoff；以實際git show為準。

## Verification
最終命令、exitcode、指紋及獨立review保存D1 Ticket／docs/verification/D1/。不重跑無變動的產品173unit／114E2E，不把既有runtime作hosted驗收。

## Blockers
平台／hosted狀態未核對：GitHub deployment API回覆Forbidden，真正應用URL／hosted結果待核對；這不阻擋已授權的main Git推送；Git流程不需要先前未套用的VERCEL_TOKEN草稿。

## Next Action
從Owner指定Vercel dashboard取得對應origin/main SHA的實際應用URL與部署結果，執行hosted流程與headers驗證；不猜測網址。
