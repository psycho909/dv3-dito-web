# 安全率／爆牌率移到記牌鍵盤

- Status: approved
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-12 Owner 於 Session 要求「安全率/爆牌率位置調整為『紀錄遊戲剛抽到的石頭』位置上，因為視覺會盯在那裏輸入，如果看到機率就能警惕」；已授權驗收通過即部署。
- Risk: L1（顯示位置與樣式調整；計算不變）
- Updated: 2026-10-12
- Branch: main
- Git / Remote authority: 依 README；不開 PR；Claude Code 驗收後推送 main 觸發 Vercel 自動部署。

## Goal

玩家輸入點數時，不必移開視線就能看到下一顆的安全率與爆牌率，並在爆牌風險高時被明顯提醒。

## Scope

- 將「安全率／爆牌率」由 `ProbabilityBreakdown` 底部移到 `RankKeypad`「記錄遊戲剛抽到的石頭」標題區（標題旁或標題與點數鍵之間），從機率區移除原位置避免重複。
- 數值沿用現有 `calculateNextDraw` 的 `safeProbability`／`burstProbability`（兩位小數），計算不變。
- 顯示閘門與原本一致：只有 SYNCED 且可計算時顯示數字；推定週期加「推定」標示；UNSYNCED、未開始、空牌池時顯示佔位（例如「—」與原因簡述），不顯示數字。
- 警示樣式（Claude Code 提出、可逆的預設門檻）：爆牌率 < 30% 一般；30%～< 50% 注意；≥ 50% 高風險。各級同時有文字標籤（例如「注意」「高風險」）與 icon／邊框，不只靠顏色；對比符合既有視覺無障礙標準；reduced-motion 下無動畫。
- 版面穩定：該區塊預留固定高度，數值出現／消失／變更警示級別時點數鍵位置不移動（沿用既有「提示更新不移動點數鍵」e2e 的量測方式加測）。
- aria：區塊有可讀標籤（例如「下一顆安全率 X%，爆牌率 Y%，高風險」），數值變更不搶焦點。
- 升版 1.8.0（Changed）；更新 `docs/UIUX Design.md` 對應段落。
- 單元與 e2e：位置在鍵盤區、原位置已移除、三級警示、閘門、375px 無溢出與不斷字、點數鍵不位移。

## Out of Scope

- 機率計算、推薦與等級預估的邏輯。
- 其他區塊重新排版。

## Acceptance

- [ ] 安全率／爆牌率顯示在「記錄遊戲剛抽到的石頭」區，機率區不再重複。
- [ ] 三級警示（<30%、30～<50%、≥50%）有文字標籤且非僅顏色。
- [ ] UNSYNCED／未開始／空牌池不顯示數字；推定週期有標示。
- [ ] 數值與警示變化時點數鍵不位移；375px 無溢出、不在字中斷行。
- [ ] 頁尾 v1.8.0，版本紀錄含 1.8.0。
- [ ] `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`npx playwright test` 全部通過。

## Constraints and Decisions

- 警示門檻為 Claude Code 預設，Owner 可再調整。

## Dependencies and Blockers

- 無。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
