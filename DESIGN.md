---
version: alpha
name: Dito Forge Calculator
description: 玩家手動記牌的鐵砧工作台，以真實下一抽機率輔助理解風險。
colors:
  soot: "#1d222a"
  anvil: "#2a313b"
  anvil-raised: "#353d49"
  seam: "#4a5462"
  edge-light: "#5d6878"
  ash: "#eef0f2"
  ash-muted: "#a9b3bf"
  heat-normal: "#7d8a99"
  heat-good: "#d98a3d"
  heat-great: "#f2b544"
  heat-perfect: "#fff1c9"
  heat-burst: "#c2414b"
  focus: "#8fd3ff"
typography:
  body:
    fontFamily: 'system-ui, "Noto Sans TC", sans-serif'
    fontSize: "16px"
rounded:
  score: "4px"
  panel: "8px"
  keypad: "10px"
spacing:
  unit: "8px"
  page-max: "1200px"
components:
  HandSummary: {}
  RankKeypad: {}
  ProbabilityBreakdown: {}
  DeckIntegrityStatus: {}
---

# 迪特的鐵匠鋪設計契約

## Overview

本文件整理既有 `docs/UIUX Design.md` §4～9 的鍛造台方向，未建立新的品牌。對象是邊看遊戲、邊在手機或電腦記錄點數的玩家；產品介面使用繁體中文（台灣），遊戲等級保留原英文。

一塊隨點數升溫的分數鐵砧板是視覺焦點，石頭片採直立六角形；周圍的機率與輸入維持平靜。不要加入爐火、遊戲素材、全頁動畫或誤導玩家能操作遊戲的強化按鈕。

## Colors

採 Model B：`src/styles/tokens.scss` 是色彩 runtime 的唯一來源；上述 frontmatter 對應同名 `--` CSS 變數。`src/styles/main.scss` 及四個元件消費這些變數，不另外手抄色碼。

soot 是背景，anvil 是面板，anvil-raised 是按鍵，seam／edge-light 是分隔與頂部高光。ash／ash-muted 是文字；focus 是鍵盤焦點。heat 系列只用於分數板邊框、等級圖形與機率條，BURST 同時提供文字及斜紋，不只靠顏色辨識。

## Typography

正文 16px、一般輔助 14px，庫存、A 的 1／11 標記及機率條件可用 13px（最低 13px）；比例及庫存採 tabular-nums。分數手機 52～60px、桌機 64～72px。保留已核准系統字型 fallback；Cubic 11 資產與完整視覺驗收留給 Ticket 11，Ticket 02 不新增外部字型請求。

## Layout

單頁產品工作區，手機為狀態→分數→機率→點數鍵；1024px 起分成左操作、右結果兩欄，最大 1200px。鍵盤始終是 A、2～5／6～10 的 5×2，觸控區至少 44px，鍵高以 60～68px 為目標。文件自然捲動，不裁切長手牌；機率與按鍵不靠 sticky 遮住彼此。

## Elevation & Depth

以平塗表面、低對比邊框及頂部一條高光表現鐵砧層級，不使用漂浮陰影或背景漸層。

## Shapes

分數板 4px、面板 8px、點數鍵 10px；石頭片的六角形只是表現手牌，不作額外互動控制。

## Components

DeckIntegrityStatus 擁有未確認／已確認狀態及一次性啟動 CTA；Pinia 的 `forgeStore` 擁有完整抽牌序列，domain 純函式推導計分與庫存。未確認不顯示精確機率，點數鍵停用；確認後焦點進入第一個點數鍵。

RankKeypad 使用 native button，明示點數及剩餘數；hover、active、focus-visible、disabled 各有可辨狀態。手牌空時 HandSummary 提示如何記錄；含 A 時明示自動採 1／11；21 或 BURST 時理論分布不宣稱遊戲可繼續。

ProbabilityBreakdown 固定 PERFECT、GREAT、GOOD、NORMAL、BURST，顯示條件、顆數來源與百分比；bar 以原始機率控制，百分比最大餘數分配保證合計 100.00%。EMPTY_DECK 不顯示 NaN 或百分比；domain 對 INVALID_DECK 回傳不可計算，本頁牌池僅從有效事件推導，不提供外部牌池輸入。

Scrollbar 的 canonical owner 是 `src/styles/main.scss`，同時使用標準屬性、WebKit fallback 與 forced-colors。狀態回饋使用文字及有節制的 aria-live；本張 Ticket 的本機計算是同步操作，沒有虛假 loading、外部請求、持久化或雲端成功訊息。沒有 table/select/date/CRUD/dialog 能力，無須建立這些控制元件。

## Do's and Don'ts

- Do：記錄玩家已在遊戲看到的點數，保留真實序列與數學可核對的顆數。
- Do：沿用 `docs/UIUX Design.md` 與 CSS tokens，百分比永遠以文字提供。
- Don't：把 21 後的理論結果當成真實遊戲可再抽的保證。
- Don't：顯示尚未實作的撤銷、換局、推薦、歷史或備份按鈕。
