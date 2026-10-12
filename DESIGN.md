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
  heat-burst: "#de6670"
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
  RankOutcomeDetail: {}
  DeckStatus: {}
  DeckDetailDrawer: {}
  RemainingVerification: {}
  HistoryDrawer: {}
  DataManagementPanel: {}
---

# 迪特的鐵匠鋪設計契約

## Overview

本文件整理既有 `docs/UIUX Design.md` §4～9 的鍛造台方向，未建立新的品牌。對象是邊看遊戲、邊在手機或電腦記錄點數的玩家；產品介面使用繁體中文（台灣），遊戲等級保留原英文。

一塊隨點數升溫的分數鐵砧板是視覺焦點，石頭片採直立六角形；周圍的機率與輸入維持平靜。不要加入爐火、遊戲素材、全頁動畫或誤導玩家能操作遊戲的強化按鈕。

## Colors

採 Model B：`src/styles/tokens.scss` 是色彩 runtime 的唯一來源；上述 frontmatter 對應同名 `--` CSS 變數。`src/styles/main.scss` 及元件消費這些變數，不另外手抄色碼。

soot 是背景，anvil 是面板，anvil-raised 是按鍵，seam／edge-light 是分隔與頂部高光。ash／ash-muted 是文字；focus 是鍵盤焦點。heat 系列用於分數板邊框、等級圖形與機率條；補滿觀察沿用 heat-good 作提示邊框及主要回答，不新增色盤。BURST 同時提供文字及斜紋，不只靠顏色辨識。熱度色只用於圖形與邊界，錯誤與級距文字使用 ash／ash-muted；互動控制的 control-edge alias 對應 heat-normal，裝飾 seam 維持低對比。

## Typography

正文 16px、一般輔助 14px，庫存、A 的 1／11 標記及機率條件可用 13px（最低 13px）；比例及庫存採 tabular-nums。工作台分數固定 56px。保留已核准系統字型 fallback；分數與點數鍵使用本機 Cubic 11 衍生 subset `Dito Forge Digits`（僅 `0-9 A /`），完整 OFL 與來源資訊隨資產保留；中文字、手牌、比例與庫存維持介面字型。固定分數／數字容器避免載入成功或 fallback 時影響操作位置；不向外部字型服務請求。

## Layout

單頁工作區最大寬度 1200px。手機首屏是一塊連續鐵砧台面，順序固定為標題列、分數板、風險熱條、點數鍵及動作列；三種回合狀態共用位置與預留高度。分數板呈現分數、等級得分、一行建議及可水平捲動的手牌；安全率／爆牌率熱條焊在鍵盤上緣。1024px 起分成左側工作台、右側分析兩欄；帳號、歷史與資料管理在兩欄下方。分析區使用平面內容與 seam 細線，不重複堆疊面板卡片。鍵盤始終是 A、2～5／6～10 的 5×2，鍵高至少 60px。文件自然捲動；對話框與抽屜維持既有 modal 層級。

## Elevation & Depth

以平塗表面、低對比邊框及頂部一條高光表現鐵砧層級，不在靜態面板使用漂浮陰影或背景漸層。唯一 modal ConfirmDialog 可使用由 soot 衍生的遮罩與陰影，區分阻擋背景操作的確認層；不新增色盤。

正常模式僅抽牌新增石頭片與分數邊界採單一不超過 150ms 的動態，reduced-motion 下使用 animation／transition none；撤銷及其他操作直接切換。

## Shapes

分數板 4px、面板 8px、點數鍵 10px；石頭片的六角形只是表現手牌，不作額外互動控制。

## Components

DeckIntegrityStatus 擁有初始未確認／已確認／未同步狀態及一次性啟動 CTA，也顯示「下局預計補滿」。初始 CTA 位於分數板；已開始後完整狀態說明移至工作台下方。Pinia 的 `forgeStore` 擁有回合與週期紀錄，domain reducer 保留每局抽牌序列，只計算目前週期庫存。初始未確認不顯示機率，點數鍵停用；啟動後焦點進入第一個仍可輸入的點數鍵。推定新週期明示尚未確認；UNSYNCED 隱藏數值，庫存標示推定，但仍可記錄與撤銷。

HandSummary 固定顯示 56px 分數、等級與得分；ACTIVE 時以單行顯示建議，FINISHED 時顯示「本局 GREAT，得 50 分」格式。石頭片維持直立六角形，手牌單行水平捲動；含 A 時明示自動採 1／11，無手牌提示如何記錄。

RankKeypad 使用 native button，明示點數及剩餘數；hover、active、focus-visible、disabled 各有可辨狀態。鍵盤上緣顯示安全率與爆牌率熱條，填滿比例等於爆牌率：低於 30% 為一般、30%～未滿 50% 為注意、至少 50% 為高風險並加斜紋；每級同時使用文字標籤。只沿用 `calculateNextDraw` 的結果與既有 SYNCED／可計算閘門；未開始、UNSYNCED、空牌池及不可計算時顯示原因，不顯示數值。填滿寬度轉場不超過 150ms，reduced-motion 下無動態；固定熱條高度，不讓數值或警示變化推移按鍵。

ProbabilityBreakdown 固定 PERFECT、GREAT、GOOD、NORMAL、BURST，顯示條件、顆數來源、得分與百分比；bar 以原始機率控制，百分比最大餘數分配保證合計 100.00%。安全率／爆牌率只在 RankKeypad 熱條顯示一次。EMPTY_DECK 不顯示 NaN 或百分比；domain 對 INVALID_DECK 回傳不可計算，本頁牌池僅從有效事件推導，不提供外部牌池輸入。

RecommendationHint 是完整停手／再抽比較文字的 canonical owner，位於工作台下方的分析區；工作台只同步顯示一行行動建議。沿用平面分析與 seam 分隔，不加入可操作遊戲的按鈕。數值顯示兩位小數並採 tabular-nums；輸入／撤銷同步原地更新，使用克制的 polite 狀態回饋，不移動焦點、不顯示假 loading。未同步、牌池空、21 或 BURST 不顯示再抽／停手建議；計算上限只顯示「目前無法計算建議」，下一抽機率仍照原閘門計算。推定週期明示推定；完成本局或本機資料錯誤時隱藏推薦。

RankOutcomeDetail 直接呈現 `calculateNextDraw` 同一結果中的十筆逐點數庫存、機率、抽後點數及等級；不自行重算。使用可展開按鈕，手機以小卡呈現並自然換行，不要求橫向捲動。DeckStatus 在工作台標題列以單行 `剩餘 N / 52` 開啟牌池說明，完整補滿提示保留於按鈕標籤及工作台下方狀態；DeckDetailDrawer 列出 A、2～10 數量，明確說明來源為玩家手動輸入，不會讀取遊戲畫面。使用 HTML dialog 的 modal layer 與原生焦點限制；開啟時焦點進入關閉控制，Escape／關閉後焦點返回觸發按鈕。

RemainingVerification 擁有與遊戲剩餘數核對的輸入、驗證及結果回饋，沿用平塗面板、既有色彩 token 與自然文件捲動。只接受 0～52 的整數；欄位有可見標籤、關聯說明與錯誤，錯誤時保留值並聚焦欄位，保存失敗交由 LocalPersistenceStatus 處理。不一致時只變更可信度及核對目標，不替玩家猜測遺漏點數；UNSYNCED 隱藏精確機率、逐點數試算及推薦，保留補記與撤銷並說明如何復原；修復至舊目標仍需核對當下遊戲剩餘數，避免遊戲繼續抽牌後舊目標過時。核對不會改變雲端備份狀態。

RoundActions 是本局操作與狀態回饋的 owner：只撤銷 ACTIVE 的最後一次輸入，手牌空時 disabled；使用固定 polite live region 回報撤銷，保留高度避免版面跳動。完成後保留最終手牌，隱藏本局下一抽機率，顯示剩餘牌池與開始新局；點數鍵鎖定。局末至少 15 顆時新局沿用庫存，少於 15 顆時才建立推定 52 顆週期；局中不補滿。新局焦點移到第一個仍可輸入的點數鍵。

DataManagementPanel 是備份、匯入預覽、重置與只清本機的 canonical owner，位於主要操作後，以 native details 展開，不干擾記牌主流程。匯出只下載記牌 session，不含裝置或認證；native file picker 由作業系統管理，接受單一 JSON，選檔前明示 5 MiB 上限。JSON 內容由既有嚴格驗證器判定，檔名以文字顯示；讀取中有狀態與取消，忽略較舊或已取消的讀取，無虛構上傳。預覽比較目前與備份的局數、週期、抽牌、手牌、庫存與可信度，選檔及預覽不保存。使用者可移除選檔、重新選檔或取消確認，不改動現有資料。

匯入覆蓋、手動重置與只清本機皆重用 ConfirmDialog，先聚焦取消並明示資料範圍與不可撤銷的後果。匯入不合併；重置須確認遊戲已補滿 52 顆，保留舊局並開始空手牌新局；清除只移除此程式紀錄，不刪雲端或其他站點資料，不自動開始新牌池。安全的匯出與匯入區和危險操作區分隔，沿用 tokens、44px native controls 與自然文件捲動。成功以原地 live status 回饋，失敗交由既有 LocalPersistenceStatus，儲存錯誤時停止資料操作；過期預覽需重選備份。檔案只在本機讀取，不顯示網路上傳進度、URL 或跨裝置恢復承諾。

HistoryDrawer 擁有歷史瀏覽、整局序列編輯、修正預覽及稽核紀錄，沿用 DeckDetailDrawer 的 native modal dialog 層與既有 token。每頁十局、最近回合優先，分頁狀態只在本機抽屜保留，不進 URL；紀錄不能分享或以 URL 還原。抽屜內部負責長內容捲動，不更改主頁自然高度。列出抽取順序、分數與級距、局前後庫存、週期分隔與觀察狀態。

序列與原因有可見 label、關聯說明與 app-owned 驗證；空序列表示空局，支援 A、2～10，以空格或逗號分隔。預覽列出受影響局的前後剩餘數、週期邊界增刪移、修正後牌池與可信度；只有按下套用才保存。已確認補滿或明確重置的邊界固定，違反門檻時顯示警告並要求明確選擇保留。超抽指出衝突局，不提供套用。保存錯誤關閉抽屜並移入既有 LocalPersistenceStatus；過期預覽要求重新預覽。取消、Escape 及關閉有未套用草稿時先提示放棄；完成後回歷史列表並宣告成功，關閉返回入口焦點。稽核顯示修正前後、理由、時間與邊界／規則警告，歷史修正不能自行洗掉未同步狀態。

CycleObservation 是補滿觀察的 canonical owner：新週期出現非阻擋面板，顯示上一局剩餘數與推定來源，提供是／不是／稍後三個至少 44px 的 native button。稍後不寫入觀察，可重新開啟；回答或稍後將焦點移到狀態文字，重新開啟聚焦第一個回答。回答不是後顯示未同步及精確機率不可保證；實際剩餘數由 RemainingVerification 核對，但總數相符不能推翻補滿否認。舊週期資料保留，歷史修正由 HistoryDrawer 提供；匯入／重置由 DataManagementPanel 提供。

ConfirmDialog 是新增的共用確認 owner，使用 HTML dialog 的 showModal／close 管理 top layer 與 inert 背景，應用程式提供標題、影響說明及按鈕，並管理 Tab 循環、Escape 取消及焦點。完成本局無法撤銷，取消為初始焦點；取消還原觸發按鈕，完成後焦點移至開始新局。沿用 8px 面板圓角與既有色彩 token；不是 browser confirm。與牌池及歷史抽屜共用 native top layer，無需另造 z-index 層級系統。

LocalPersistenceStatus 是本機錯誤復原的 canonical owner，沿用平塗面板、8px 圓角、heat-burst 錯誤邊框及文字，不靠顏色表示失敗。讀取／驗證／寫入失敗時保留原資料並停止遊戲操作與機率顯示，將焦點移至錯誤標題，先關閉既有完成對話框。提供原始字串下載與明確重新讀取；沒有可讀原資料時不提供下載。重讀成功焦點回目前回合的適當操作，失敗持續保留錯誤。沒有清空／重置／一般匯入匯出按鈕。

CloudBackupStatus 是雲端備份狀態 owner，與 DeckIntegrityStatus 的牌池可信度分開；標題列只顯示一行雲端狀態，其完整操作與說明移至工作台下方。GitHub 登入後須以共用 ConfirmDialog 摘要確認上傳／空裝置下載，取消為初始焦點。只在當前快照獲伺服器確認且無待送時顯示已備份；離線待送、錯誤與衝突均保留本機資料並顯示文字及重試方式。衝突比較顯示兩端摘要與時間，先下載兩版及待送備份，再明確確認選版；時間不決定勝負，不自動合併。登出在上傳中、待送或雲端操作時阻止。雲端刪除使用同一確認元件，明示刪除本機及雲端歷史、保留版本墓碑且不刪 Auth 帳號；伺服器確認前保留本機。已刪除版本顯示刪除時間，重新啟用須明確建立全新週期。

Scrollbar 的 canonical owner 是 `src/styles/main.scss`，同時使用標準屬性、WebKit fallback 與 forced-colors。狀態回饋使用文字及有節制的 aria-live；本機計算與保存是同步操作，沒有虛假 loading 或外部請求。沒有 table/select/date/CRUD 能力，無須建立這些控制元件。

## Do's and Don'ts

- Do：記錄玩家已在遊戲看到的點數，保留真實序列與數學可核對的顆數。
- Do：沿用 `docs/UIUX Design.md` 與 CSS tokens，百分比永遠以文字提供。
- Don't：把 21 後的理論結果當成真實遊戲可再抽的保證。
- Don't：把推定補滿當成已讀取遊戲畫面，或顯示尚未實作的歷史修正或備份按鈕；推薦只是說明，不操作遊戲或保證收益。
