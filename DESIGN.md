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
  RoundActions: {}
  ConfirmDialog: {}
  CycleObservation: {}
  LocalPersistenceStatus: {}
  CloudBackupStatus: {}
  RecommendationHint: {}
---

# 迪特的鐵匠鋪設計契約

## Overview

本文件整理既有 `docs/UIUX Design.md` §4～9 的鍛造台方向，未建立新的品牌。對象是邊看遊戲、邊在手機或電腦記錄點數的玩家；產品介面使用繁體中文（台灣），遊戲等級保留原英文。

一塊隨點數升溫的分數鐵砧板是視覺焦點，石頭片採直立六角形；周圍的機率與輸入維持平靜。不要加入爐火、遊戲素材、全頁動畫或誤導玩家能操作遊戲的強化按鈕。

## Colors

採 Model B：`src/styles/tokens.scss` 是色彩 runtime 的唯一來源；上述 frontmatter 對應同名 `--` CSS 變數。`src/styles/main.scss` 及元件消費這些變數，不另外手抄色碼。

soot 是背景，anvil 是面板，anvil-raised 是按鍵，seam／edge-light 是分隔與頂部高光。ash／ash-muted 是文字；focus 是鍵盤焦點。heat 系列用於分數板邊框、等級圖形與機率條；補滿觀察沿用 heat-good 作提示邊框及主要回答，不新增色盤。BURST 同時提供文字及斜紋，不只靠顏色辨識。

## Typography

正文 16px、一般輔助 14px，庫存、A 的 1／11 標記及機率條件可用 13px（最低 13px）；比例及庫存採 tabular-nums。分數手機 52～60px、桌機 64～72px。保留已核准系統字型 fallback；Cubic 11 資產與完整視覺驗收留給 Ticket 11，Ticket 02 不新增外部字型請求。

## Layout

單頁產品工作區，手機為狀態→分數→機率→點數鍵；1024px 起分成左操作、右結果兩欄，最大 1200px。鍵盤始終是 A、2～5／6～10 的 5×2，觸控區至少 44px，鍵高以 60～68px 為目標。文件自然捲動，不裁切長手牌；機率與按鍵不靠 sticky 遮住彼此。

## Elevation & Depth

以平塗表面、低對比邊框及頂部一條高光表現鐵砧層級，不在靜態面板使用漂浮陰影或背景漸層。唯一 modal ConfirmDialog 可使用由 soot 衍生的遮罩與陰影，區分阻擋背景操作的確認層；不新增色盤。

## Shapes

分數板 4px、面板 8px、點數鍵 10px；石頭片的六角形只是表現手牌，不作額外互動控制。

## Components

DeckIntegrityStatus 擁有初始未確認／已確認／未同步狀態及一次性啟動 CTA，也顯示「下局預計補滿」。Pinia 的 `forgeStore` 擁有回合與週期紀錄，domain reducer 保留每局抽牌序列，只計算目前週期庫存。初始未確認不顯示機率，點數鍵停用；啟動後焦點進入第一個仍可輸入的點數鍵。推定新週期明示尚未確認；UNSYNCED 隱藏機率，庫存標示推定，但仍可記錄與撤銷。

RankKeypad 使用 native button，明示點數及剩餘數；hover、active、focus-visible、disabled 各有可辨狀態。手牌空時 HandSummary 提示如何記錄；含 A 時明示自動採 1／11；21 或 BURST 時理論分布不宣稱遊戲可繼續。

ProbabilityBreakdown 固定 PERFECT、GREAT、GOOD、NORMAL、BURST，顯示條件、顆數來源與百分比；bar 以原始機率控制，百分比最大餘數分配保證合計 100.00%。EMPTY_DECK 不顯示 NaN 或百分比；domain 對 INVALID_DECK 回傳不可計算，本頁牌池僅從有效事件推導，不提供外部牌池輸入。

RecommendationHint 是本局停手／再抽說明的 canonical owner，位於機率卡下方，沿用平塗面板、既有文字色及 8px 圓角，不加入可操作遊戲的按鈕。依據只看本局最終點數接近 21，常駐「以最終點數接近 21 為目標，不代表獎勵最高」；數值顯示兩位小數並採 tabular-nums。輸入／撤銷同步原地更新，使用克制的 polite 狀態回饋，不移動焦點、不顯示假 loading。未同步、牌池空、21 或 BURST 不顯示再抽／停手建議；計算上限只顯示「目前無法計算建議」，機率卡不受影響。推定週期明示推定；完成本局或本機資料錯誤時隱藏推薦。

RoundActions 是本局操作與狀態回饋的 owner：只撤銷 ACTIVE 的最後一次輸入，手牌空時 disabled；使用固定 polite live region 回報撤銷，保留高度避免版面跳動。完成後保留最終手牌，隱藏本局下一抽機率，顯示剩餘牌池與開始新局；點數鍵鎖定。局末至少 15 顆時新局沿用庫存，少於 15 顆時才建立推定 52 顆週期；局中不補滿。新局焦點移到第一個仍可輸入的點數鍵。

CycleObservation 是補滿觀察的 canonical owner：新週期出現非阻擋面板，顯示上一局剩餘數與推定來源，提供是／不是／稍後三個至少 44px 的 native button。稍後不寫入觀察，可重新開啟；回答或稍後將焦點移到狀態文字，重新開啟聚焦第一個回答。回答不是後顯示未同步及精確機率不可保證；實際剩餘數核對與手動修正留給 Ticket 08／10，本票不提供未實作的入口。舊週期資料保留，但完整歷史介面留給 Ticket 09。

ConfirmDialog 是新增的共用確認 owner，使用 HTML dialog 的 showModal／close 管理 top layer 與 inert 背景，應用程式提供標題、影響說明及按鈕，並管理 Tab 循環、Escape 取消及焦點。完成本局無法撤銷，取消為初始焦點；取消還原觸發按鈕，完成後焦點移至開始新局。沿用 8px 面板圓角與既有色彩 token；不是 browser confirm。此頁沒有其他 overlay，無需另造 z-index 層級系統。

LocalPersistenceStatus 是本機錯誤復原的 canonical owner，沿用平塗面板、8px 圓角、heat-burst 錯誤邊框及文字，不靠顏色表示失敗。讀取／驗證／寫入失敗時保留原資料並停止遊戲操作與機率顯示，將焦點移至錯誤標題，先關閉既有完成對話框。提供原始字串下載與明確重新讀取；沒有可讀原資料時不提供下載。重讀成功焦點回目前回合的適當操作，失敗持續保留錯誤。沒有清空／重置／一般匯入匯出按鈕。

CloudBackupStatus 只顯示「僅本機」及未啟用雲端備份的說明；與 DeckIntegrityStatus 的牌池可信度分開。合法操作同步保存，沒有虛構 saving spinner、雲端已備份或跨裝置成功訊息。

Scrollbar 的 canonical owner 是 `src/styles/main.scss`，同時使用標準屬性、WebKit fallback 與 forced-colors。狀態回饋使用文字及有節制的 aria-live；本機計算與保存是同步操作，沒有虛假 loading 或外部請求。沒有 table/select/date/CRUD 能力，無須建立這些控制元件。

## Do's and Don'ts

- Do：記錄玩家已在遊戲看到的點數，保留真實序列與數學可核對的顆數。
- Do：沿用 `docs/UIUX Design.md` 與 CSS tokens，百分比永遠以文字提供。
- Don't：把 21 後的理論結果當成真實遊戲可再抽的保證。
- Don't：把推定補滿當成已讀取遊戲畫面，或顯示尚未實作的歷史修正或備份按鈕；推薦只是說明，不操作遊戲或保證收益。
