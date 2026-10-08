# 遊戲待確認規則實測

- Status: draft
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 未取得
- Risk: L1
- Updated: 2026-10-08
- Branch: main
- Git / Remote authority: 依 README

## Goal

由 Owner 在真實遊戲中觀察 `docs/遊戲詳細規則.md` §5、§7 的待確認事項，確認後修訂規則文件與相關規格。

## Scope

- 補牌時機：局末剩餘 <15 時是否一律在下一局開始前補滿 52；剩 15 是否不補。
- 達 21 是否自動強制結算；BURST 後是否禁止再抽；0 點能否按完成。
- 一局內抽光剩餘牌池時遊戲如何處理。
- 每項附截圖（放 `docs/references/`）與觀察日期。

## Out of Scope

- 獎勵數值、下注倍率與成本公式（V1 不納入）。

## Acceptance

- [ ] 每個待確認項目標記為「已確認／與假設不符／仍無法觀察」並附證據。
- [ ] 與假設不符的項目已修訂 `docs/遊戲詳細規則.md`，並列出受影響的規格與測試。

## Constraints and Decisions

- 以實際遊戲行為為準；先修訂規則與測試，再改程式。

## Dependencies and Blockers

- 需要 Owner 在遊戲活動期間實際操作並截圖。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:
