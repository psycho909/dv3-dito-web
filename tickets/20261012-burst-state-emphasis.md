# 本局爆牌狀態視覺強化

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-12 Owner 指派本次 UI 調整、Ticket、patch 升版、測試及五項驗證，初始要求不 commit／push；後續 Lead 驗收通過，Owner 於目前 Session 明確授權 1.11.1 commit／push 至 `origin/main` 觸發 Vercel Production，並要求正式站驗證及 Ticket evidence 另做 docs commit／push。
- Risk: L1（既有分數板與風險條的條件式視覺調整；不改 domain 計算或資料）
- Updated: 2026-10-12
- Branch: main
- Git / Remote authority: Owner 後續授權直接 commit／push 至 `origin/main` 並觸發 Vercel Production；不開 PR、不手動部署、不回滾。

## Goal

當目前手牌分類為 BURST 時，玩家可立即辨認分數板與鍵盤上方的終局風險提示。

## Scope

- 沿用 `--heat-burst` 與 `--soot`，強化 `HandSummary` 分數、等級、得分及面板；`RankKeypad` 風險條只在 `riskMode === terminal && currentTier === BURST` 套用爆牌樣式。
- 保留 `BURST` 與「本局已爆牌」文字；以 E2E 驗證爆牌標記、WCAG AA 文字對比及 375px 無水平溢出。
- 四個既有 E2E 測試的截圖輸出改用 Playwright `testInfo.outputPath()`：Windows 執行時固定 `/tmp/...` 截圖路徑發生 EPERM 拒絕覆寫；此調整只為讓指定整套 E2E 可重現，不影響產品行為。
- 更新 `DESIGN.md`、`CHANGELOG.md`，並將網站版本由 1.11.0 升為 patch 1.11.1，同步 package lock。
- 執行 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build`、`npm run e2e`。

## Out of Scope

- domain 計算、其他 tier／回合狀態配色、依賴與新增色票。
- PR／merge、手動 Vercel 部署與 rollback；本次只發布至 `origin/main`。

## Acceptance

- [x] BURST 分數板使用爆牌邊框／底色，分數與等級得分採符合 AA 的爆牌色；標籤保留 `BURST`。
- [x] 風險條只在 `riskMode === terminal` 且 tier 為 BURST 時使用爆牌色並保留「本局已爆牌」；FINISHED 的 next-round 預估維持原樣式。
- [x] E2E 驗證爆牌狀態標記與可見文字的對比至少 4.5:1，並驗證 375px 無水平溢出。
- [x] reduced-motion 下沒有新增動態；其他 tier 的配色與 domain 結果不變。
- [x] package／lock／changelog 版本均為 1.11.1；五項指定驗證全數通過。


## Constraints and Decisions

- 使用既有 `--heat-burst: #de6670` 與 `--soot: #1d222a`，不新增 token。兩者對比 4.75:1；`--ash: #eef0f2` 對 `--soot` 為 13.98:1。
- 全域 `prefers-reduced-motion: reduce` 規則停用動畫及轉場；本次只新增靜態色彩樣式。

## Dependencies and Blockers

- 無。

## Evidence

- Verification: `npm run lint` pass；`npm run typecheck` pass；`npm run test` pass（20 files／249 tests）；`npm run build` pass（139 modules）；`set PLAYWRIGHT_HTML_OPEN=never&& npm.cmd run e2e` pass（138／138，1.4m）。新增回歸測試修正前在 mobile／desktop 均重現 next-round 風險條紅底（computed `rgb(222, 102, 112)`），套用 terminal 條件後 focused E2E 2／2 通過；完整 E2E 亦驗證 next-round 使用原 `--soot` 底色與 `--ash` 字色。原 BURST active 視覺測試仍驗證 375px 無水平溢出與文字對比 ≥4.5:1。
  - Production verification（2026-10-12 21:30 Asia/Taipei／13:30 UTC）：Vercel Production deployment `dpl_7vnR9DihhThzE5TMaYMaupG49Syw` 狀態 `READY`，Git ref `main`、source SHA `eed46b27b33cf4974f870a72de52c7731fc5b40d`；正式網址 `https://dv3-dito-web.vercel.app/`、HTML HTTP 200，JS `/assets/index-BErcFw7S.js` HTTP 200（含 `1.11.1` 與「本局已爆牌」），CSS `/assets/index-B8RcX1q1.css` HTTP 200（含 terminal BURST selector 與 `--heat-burst`）。
- Review / Audit: L1 primary self-review 對照 Owner Scope 與專案規範；風險條樣式限 `riskMode === terminal && currentTier === BURST`，FINISHED next-round 與 21 點 terminal 不套用；HandSummary 完局結果樣式保留。未改 domain、資料、其他狀態配色或依賴；沿用 reduced-motion 規則。基準 HEAD `859b2911215c093e343c4a7ae04843eee2ee6beb`；檢視工作目錄 diff，`git diff --check` pass。
- Commit / PR: `eed46b27b33cf4974f870a72de52c7731fc5b40d`（`feat(ui): emphasize active burst state`）已 commit 並 push 至 `origin/main`；本次正式站驗證紀錄另以 `docs(tickets)` commit。
