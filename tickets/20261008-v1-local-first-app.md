# V1 本機優先計算器（不含 Supabase）

> 2026-10-08 已由 Owner 核准拆票取代：01～12、D1（見 `TODO.md`）。本檔只保留歷史，不再是目前狀態正本。

- Status: archived
- Owner: User（沿用 README，2026-10-08 確認）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 於 Kiro Session 明確要求「開始進行開發」；Scope 依已核准規格 `docs/開發規格.md` v1.5、`docs/UIUX Design.md`、`docs/遊戲詳細規則.md` v1.2
- Risk: L2
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README「已核准且驗證通過的更新，預先授權 push 到目前工作分支」；PR、deploy 不在授權內

## Goal

依 `docs/開發規格.md` v1.5、`docs/遊戲詳細規則.md` v1.2、`docs/UIUX Design.md` 建立可實際操作的 V1 本機優先 SPA：記牌、剩餘牌池、精確下一抽分布、本局推薦、跨局與補滿邊界、撤銷、歷史修正、本機持久化與 JSON 匯入匯出。

## Scope

- 專案骨架：依開發規格 §3（Vite + Vue 3 + TypeScript + Pinia + SCSS + Vitest + Playwright），套件版本鎖定、lockfile 入庫。
- Domain：`rules.ts`、`scoring.ts`、`probability.ts`、`validation.ts`、`recommendation.ts`（FR-01、FR-04、FR-05、FR-13）。
- Application：`gameReducer.ts`（FR-02、FR-03 含週期邊界紀錄、補滿觀察、智慧型歷史修正；FR-06；FR-07）、`persistence.ts`（FR-08 的本機部分：`PersistedSession`、`LocalEnvelope`、JSON 匯入匯出；雲端佇列欄位保留但不連線）。
- UI：UIUX Design.md 的主畫面、元件 A（DeckIntegrityStatus）、B～G、D2 RecommendationHint；§8 鍛造台視覺系統（含 Cubic 11 數字 subset 與 OFL.txt）；FR-09 斷點與無障礙。CloudBackupStatus 只顯示 `DISABLED／僅本機`。
- 測試：開發規格 §5 中不依賴 Supabase 的單元測試（T01～T22、T31、T32、T34～T37）與 e2e（雲端項目除外）。
- README：啟動、測試、驗證入口表、待確認遊戲規則。

## Out of Scope

- FR-10～FR-12 Supabase（Auth、資料表、RLS、RPC、雲端同步、衝突、刪除）、T23～T30、T33：另開 Ticket（Risk L3）。
- 部署（Vercel）、PR、PWA 離線重開。
- 推薦引擎 L2 週期修正（FR-13 附錄，未採用）。

## Acceptance

- [ ] `lint`、`typecheck`、`unit tests`、`build`、`e2e` 全數通過（以實際腳本為準）。
- [ ] AC-01～AC-07、AC-14 有對應自動化測試且通過；AC-08 的本機部分（重新整理、JSON 匯出→清空→匯入）通過。
- [ ] 4、7、6 主畫面顯示 17/21、剩 49、`6.12／16.33／8.16／0.00／69.39%`，推薦 `STOP`。
- [ ] 320／375／768／1024／1440 截圖無水平溢出、重疊；鍵盤可操作、focus 可見、reduced-motion 生效。
- [ ] UNSYNCED 時不顯示精確機率與推薦。
- [ ] README 驗證入口表填寫實際命令。

## Constraints and Decisions

- 規格三份文件為唯一需求依據；衝突時停止並記錄，不自行編造規則。
- 撤銷只限本局；重做選做；BURST 距離固定 22；推薦只做 L1，每局清空快取，`COMPUTATION_LIMIT` 回退。
- 不新增規格未列出的依賴；Cubic 11 字型自官方 repo（ACh-K/Cubic-11，SIL OFL）取得並 subset，附授權全文。
- 委派模型：依 README 角色表（GPT-6 Luna），依工作性質設定 effort（domain／reducer 為 max，UI 與一般測試為 medium，QA runner 為 low）。
- 2026-10-08 Owner 指示停止開發、先規劃 TODO；第一次開發工作流已中止，未產生任何程式或 commit。重新開工需 Owner 明確指示。

## Dependencies and Blockers

- 規格文件修改尚未 commit（見 `.scratch/20261008-spec-recommender-revision/handoff.md`）；施工前先 commit 作為基準。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
