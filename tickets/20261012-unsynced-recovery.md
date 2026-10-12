# 牌池未同步恢復條件調整

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-12 Owner 指派放寬牌池未同步恢復條件並明確選定方案 A；Lead 指定按規格施工、測試先行、升版至 1.12.0，且本次不授權 Agent 執行 Git 發布或 Vercel 指令。
- Risk: L2（總數相同即可恢復同步會重新開放精確機率／推薦，但不證明各點數庫存正確）
- Updated: 2026-10-12
- Branch: main
- Git / Remote authority: 本次 Agent 僅修改檔案與執行測試；git add／commit／push 及部署驗證由 Lead 處理。

## Goal

玩家在牌池 UNSYNCED 時，能以遊戲當下剩餘總數與工具推算總數重新核對，避免舊回報值因遊戲繼續抽牌而過期，永久阻斷同步恢復。

## Scope

- 調整 `VERIFY_REMAINING`：UNSYNCED 的每次合法輸入都更新最後回報數；總數相符時恢復 SYNCED，不再要求舊回報相同或確認基準。
- 保留例外：依持久化語意計算的最近一次有效 observation 為 `DENIED` 時，總數相符仍是 UNSYNCED；此否認會沿續至新的 `CONFIRMED_52` 或固定牌池週期（確認補滿／手動重置）。
- 維持 SYNCED 的相符／不符行為；history correction、persistence 與 recommendation 閘門須符合新規則。
- 更新核對剩餘與主畫面未同步指引、README／DESIGN、CHANGELOG 及 package／lock 至 1.12.0。
- 以 reducer 單元測試先 RED 後 GREEN，並以 E2E 驗證不符核對、繼續記牌、以新當下總數恢復及顯示機率。

## Out of Scope

- 點數推算、domain 計分／抽牌、備份 schema、同步事件格式及其他狀態行為。
- Git staging／commit／push、Vercel 或正式部署。

## Acceptance

- [x] UNSYNCED 時 0～52 合法輸入與工具總數相符即可更新回報並恢復 SYNCED，不受舊數字或 baseline 限制。
- [x] UNSYNCED 時不同總數更新回報且維持 UNSYNCED；後續抽牌使總數變動後可用新數字恢復。
- [x] DENIED 沿續到下一個未回答補滿週期時，即使總數相同仍維持 UNSYNCED 並更新回報；新的 `CONFIRMED_52` 或固定牌池週期可清除沿續；SYNCED 相符／不符行為不變。
- [x] reducer 的同步恢復、DENIED 沿續與新補滿確認後恢復狀態均通過 serialize→parse/hydrate 往返；history correction、reducer 與 persistence 共用有效 observation 語意。
- [x] 總數核對不修改任何點數庫存；UNSYNCED 時精確機率與推薦維持隱藏，恢復同步後可見。
- [x] README、DESIGN、RemainingVerification 與 App 文案對齊；版本與 CHANGELOG 為 1.12.0。
- [x] `npm run lint`、`npm run typecheck`、`npm run test`、`npm run build`、`PLAYWRIGHT_HTML_OPEN=never npm run e2e` 通過。

## Constraints and Decisions

- Owner 選擇方案 A：依工具推算總數核對，不由差額猜點數、不改變各點數庫存。
- 明確風險：總數相同不保證各點數數量都正確；最近一次補滿確認回答「不是 52 顆」且之後尚未確認新的補滿或手動重置時，DENIED 沿續作為可信度例外。
- Reducer、history correction 與 persistence 共用 `effectiveObservation`，其語意沿用 persistence 原有規則：DENIED 跨連續 `BELOW_15_NEXT_ROUND` 週期延續，新的 observation 覆蓋，`USER_CONFIRMED_FULL`／`MANUAL_RESET` 清除。Persistence 仍拒絕有效 observation 為 DENIED 的 SYNCED 資料；格式不變。
- History correction 仍不自動恢復同步；只保留未同步狀態，等待明確 VERIFY_REMAINING。Recommendation 仍以 SYNCED 作為精確機率／推薦閘門。
- Skill：`matt-skills-curated:tdd` 1.1.0；依 reducer 公開事件介面先 RED、再最小 GREEN。

## Dependencies and Blockers

- 無。

## Evidence

- Verification:
  - 方案 A TDD RED：原行為下恢復條件新案例失敗；第一輪實作後單元測試曾通過，Lead Review 再揭露 DENIED 跨未回答新週期的 reducer／persistence 不一致。
  - Lead Review 回歸 RED：加入 A=`BELOW_15`/`DENIED` → B=`BELOW_15`/未回答後相符核對及保存往返測試，原 reducer 產生 `SYNCED`，新案例失敗。
  - 共用 `effectiveObservation` 後 targeted GREEN：reducer、persistence、history correction、RemainingVerification 共 4 個測試檔，73/73 通過；serialize→parse/hydrate 覆蓋同步恢復、DENIED 延續，以及新週期 `CONFIRMED_52` 後恢復。
  - `npm run lint`：PASS，exit 0。
  - `npm run typecheck`：PASS，exit 0；第一次檢查發現 persistence 遺漏既有型別匯入，補正後通過。
  - `npm run test`：PASS，20 個檔案、253 個測試。
  - `npm run build`：PASS，Vite 轉換 140 modules。
  - Windows 等效指令 `set PLAYWRIGHT_HTML_OPEN=never&& npm run e2e`：PASS，138/138（mobile、desktop）；環境變數設為 `never`。包含未同步核對、繼續記牌及以新總數恢復同步流程。
- Production verification (Lead; 2026-10-12): commit `2dfbdf4` (`feat(sync): allow unsynced recovery by matching current remaining total`) 已 push 至 `origin/main`；正式站 `https://dv3-dito-web.vercel.app/` HTML 回應 HTTP 200，JavaScript 資產 `/assets/index-D_pzctw9.js` 回應 HTTP 200，內容含 `1.12.0` 與新文案「上次回報」。Push 後約 210 秒生效。
- Review / Audit: Lead review 退回 1 項：reducer 與 persistence 的 DENIED 判定不一致，可能使資料重新載入時被拒。已用 `effectiveObservation` 共用 helper 統一判定並補 serialize→parse/hydrate round-trip 測試。Lead 獨立重跑 `npm run lint`、`npm run typecheck`、unit 253 項、`npm run build` 與相關 E2E 10 項，均通過。
- Commit / PR: commit `2dfbdf4` (`feat(sync): allow unsynced recovery by matching current remaining total`) 已 push 至 `origin/main`。
