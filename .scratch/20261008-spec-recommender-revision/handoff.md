# Task Handoff

## Identity
- Task: 規格文件修訂（UIUX 鍛造台視覺、遊戲規則釐清、開發規格 v1.5：智慧型歷史修正、Supabase 紀錄補強、FR-13 推薦引擎）
- Authority / Ticket: 無 Ticket；Owner 於目前 Session 明確授權的 L1 文件修改（不含程式開發）
- Status: in_progress
- Updated: 2026-10-08
- Source environment: Kiro（Windows，d:\Codex\dv3-dito-web）
- Branch: main
- Remote: origin（https://github.com/psycho909/dv3-dito-web.git）
- Base commit: 663a40f8af271f9420ec69fc5eceef143205239a（調整）
- Working tree: dirty — 3 份 docs 已修改未 commit；`.scratch/` 未追蹤
- Sync target: origin/main

## Goal and Acceptance
- 三份規格文件內容一致、可作為後續實作依據，且已依 Owner 決策更新。
- FR-13 依三輪原型結論定案：V1 只做 L1 局內推薦，L2 週期修正移入附錄。
- 修改經 Owner 確認 commit 方式後 commit／push 到 origin/main。

## Completed
- `docs/UIUX Design.md`：§8 改為「鍛造台」視覺系統（熱度色階、六角石頭片、Cubic 11 數字字型、單一動態時刻）；移除錯誤的「石頭色」token；圖片路徑改為 `docs/references/`；撤銷只限本局；智慧型修正預覽與補滿確認提示；新增 D2 RecommendationHint（只看本局、COMPUTATION_LIMIT 文案）。
- `docs/遊戲詳細規則.md` v1.2：釐清教學數字色 ≠ 石頭顏色；圖片路徑；補牌時機以玩家一鍵觀察收集實測證據；機率計算與推薦引擎分界。
- `docs/開發規格.md` v1.5：
  - FR-02 撤銷只限本局 `ACTIVE` 回合，重做選做。
  - FR-03 週期邊界紀錄、補滿觀察（CONFIRMED_52／DENIED）、智慧型歷史修正（重播＋預覽＋確認，僅非法重播才拒絕）。
  - FR-04 引擎輸出欄位對齊（remainingTotal、currentScore、safe／burst、INVALID_DECK）。
  - FR-10 Supabase：ForgeActionType 列舉、週期邊界與觀察必須上雲、大小上限、Manual Linking、Turnstile、RPC revoke PUBLIC、匿名帳號不清理（Owner 決定）。
  - FR-13 推薦引擎：distance(s≤21)=21−s、BURST 固定 22（Owner 確認）；只做 L1 exact expectimax、每局清空快取、COMPUTATION_LIMIT；AC-14 精確值 15.755102040816325（容差 1e-9）；附錄記錄 L2 研究未採用。
  - 測試 T14、T21～T22、T31～T37 調整或新增。
- 三輪推薦引擎原型（throwaway）：`.scratch/recommender-prototype/`，報告 `REPORT.md`（第二輪）、`REPORT-round3.md`（第三輪）。

## Remaining
- Owner 決定 commit 方式，再 commit／push。
- 依決定處理原型報告的版控位置（FR-13 附錄引用 `.scratch/recommender-prototype/REPORT-round3.md`）。
- README 角色表 Luna Max 寫「GPT-6 Luna／max」，實際 Kiro 模型 ID 為 `gpt-5.6-luna`；是否更新 README 尚未決定。

## Decisions
- 視覺方向「鍛造台」與方向檢核表：Owner 同意，但先不進行設計開發。
- 重做：選做。撤銷：只限本局，跨局走歷史修正。
- 歷史修正：智慧型調整（未確認的推定邊界自動調整，玩家確認過的邊界固定）。
- 匿名帳號：不清理。
- 推薦目標：最接近 21；BURST 距離固定 22。
- 允許 L2 未來局使用近似策略；第三輪實測 L2 無顯著改善 → Owner 同意 V1 只做 L1，L2 移入附錄。

## Changed Files
- docs/UIUX Design.md
- docs/遊戲詳細規則.md
- docs/開發規格.md
- .scratch/recommender-prototype/（原型程式與報告，未追蹤）
- .scratch/20261008-spec-recommender-revision/handoff.md（本檔）

## Verification
- 文件：以 grep 核對殘留詞（L2、λ、rollout、Worker、stone 色 token、totalRemaining）已清除或只存在於附錄；未執行任何建置（專案尚無程式碼）。
- 原型第三輪實測（Node v22.14.0）：L1 1,046/1,046 完成 0 中止；無 memo 對照 0/1000 不一致；§3 計分 10/10；4+7+6 = STOP／4／15.755102040816325；λ 2,000 週期 = 4.631719382401439；L1 vs L1+L2 200 組成對週期改善 −0.027，CI [−0.061, +0.007]，不顯著。
- 未驗證：瀏覽器／手機效能、Playwright CPU 4×、真實遊戲補牌行為、Supabase 設定。

## Blockers
- 等待 Owner 決定 commit 方式（main 為工作分支，依使用者偏好 commit 需明確授權）。
- 本 handoff 尚未 push；遠端未包含前，跨環境交接尚未完成。

## Next Action
- Owner 選擇 commit 方式：(1) 只 commit 三份 docs；(2) docs＋把兩份原型報告複製到 `docs/research/` 一起 commit，並把 FR-13 附錄連結改到 `docs/research/`；(3) 暫不 commit。選定後依 docs/HANDOFF.md §3 commit、push 並核對 `HEAD == origin/main`。
