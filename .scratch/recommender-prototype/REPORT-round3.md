# FR-13 推薦引擎原型驗證報告（ROUND 3）

> **PROTOTYPE／throwaway**：本報告與程式只回答 FR-13 演算法研究問題，全部位於 `.scratch/recommender-prototype`；不是產品程式、不是產品依賴，不修改正式規格、不寫入 Supabase。第二輪原文保留在 `REPORT.md`。

## 執行摘要

- Node：`v22.14.0`；Windows `x64`；CPU：`Intel(R) Core(TM) Ultra 7 165H`；logical CPUs：22。
- 固定規則未改：A/2～9 各 4、10 為 16、總數 52；A 先算 1 再至多加 10；`distance(s≤21)=21-s`、`s≥22=22`；局末剩餘 `<15` 才在下一局前換新 52；當下 L1 仍為 exact expectimax。
- Round 3 核心變更：L1 cache 改為**每局生命週期**，局末清空；L2 的當下決策仍讀 exact L1，後續模擬改用便宜近似策略。
- λ 以 20 個獨立子程序、每個 100 個絕對 seeded cycles 合併產生，避免單一長程序的執行器資源問題；不降低樣本數、不改牌規則。
- 最終結論：λ 完成 2,000 cycles，可作為規格常數候選；固定 hard/soft 門檻策略優於另一個 composition 分桶策略，但完整 200-cycle L1+L2 沒有統計顯著改善，點估計反而略差，因此不能宣稱 L2 已改善週期表現。

## 重現命令

工作目錄為 repo 根目錄：

```cmd
node --version
node --expose-gc .scratch\recommender-prototype\run-r3-l1.mjs
node --expose-gc .scratch\recommender-prototype\run-r3-lambda.mjs
node --expose-gc .scratch\recommender-prototype\run-r3-l2.mjs
node --expose-gc .scratch\recommender-prototype\run-r3-compare.mjs
node --expose-gc .scratch\recommender-prototype\run-r3-all.mjs
```

正式 2,000-cycle 與 200-cycle 的本次執行使用 `run-r3-all.mjs` 所封裝的短子程序範圍與合併器：`run-r3-lambda.mjs` + `run-r3-lambda-merge.mjs`、`run-r3-compare.mjs` + `run-r3-compare-merge.mjs`。每個子程序的 seed label 仍是絕對的 `r3-lambda-{cycle}`／`r3-compare-{cycle}`，不是重新編號的抽樣。

## 與第二輪差異

1. 第二輪使用跨局 shared canonical cache；本輪改為 `beginRound()` 建立、`endRound()` 清空，key 仍固定為 `(deck counts, lowTotal, hasAce)`，不含手牌順序。
2. 第二輪 rollout 未來仍反覆觸發 exact L1；本輪只有當下那一步使用 exact L1，forced action 之後的本局餘段及後續局使用近似策略。
3. 第二輪 λ 僅 9 cycles；本輪完成預定 2,000 cycles／33,355 局。
4. 本輪新增 common random numbers、序貫停止、兩種近似策略、500 個 targeted points、200 個 paired full cycles 與常駐 worker timing。

## A. Per-round cache、L1 benchmark 與正確性

| 項目 | 實測結果 |
|---|---:|
| Round 2 同口徑 L1 benchmark | 1,046 局面；完成 1,046；中止 0 |
| fresh-empty exact L1 | 7,580 cache states；7.7179 ms；`DRAW` |
| 全 benchmark 時間 | p50 0.0024 ms；p95 0.0107 ms；max 7.7179 ms |
| benchmark 最大單局 cache | 7,580 states |
| fresh-empty heap delta | 1,982,008 bytes；這是 process heap delta，不是逐 entry allocation |
| B 長期批次觀測 process heap peak | 50,150,872 bytes，約 47.83 MiB；每局 cache 仍於局末清空 |
| 1,000 組 no-memo 對照 | mismatch 0/1,000；最大 expected-distance 誤差 0；容差 `1e-9` |
| §3 十個計分案例 | 10/10 通過 |
| `4+7+6` | `STOP`；`stopDistance=4`；`drawExpectedDistance=15.755102040816325` |

`4+7+6` 下一抽級距顆數為 `PERFECT=3、GREAT=8、GOOD=4、NORMAL=0、BURST=34`／49，符合規則。這些結果是實測通過；手機與 Playwright CPU 4× 未執行。

## B. FRESH_DECK_BASELINE λ

- 完成狀態：**2,000/2,000 cycles，33,355 局，complete=true**。
- λ（所有局級 distance 平均）：**4.631719382401439**。
- 局級 distance 95% CI：`[4.5976086662280276, 4.66583009857485]`。
- 以週期平均再聚合：`4.622126829942502`；95% CI `[4.590903198135624, 4.65335046174938]`。
- 每週期平均局數：**16.6775**；95% CI `[16.644944829680107, 16.71005517031989]`。
- 20 個 100-cycle 隔離子程序累計 exact L1 執行時間：18.6058 s；不是單一長程序 wall-clock 宣稱。
- per-round cache 最大觀測為 5,462 states；A 的 fresh-empty 上限為 7,580 states。

**λ 是否可寫入規格：是，依本輪預先設定的「完成 2,000 fresh cycles 才可標示可寫入」門檻。** 寫入時必須同時保存本報告、seed 產生方式、L1 版本、`BURST_DISTANCE=22` 與 `<15` 邊界；只要 L1、distance 或補牌邊界變動就重算。

## C. 近似 rollout 策略

兩種策略都不取代當下 exact L1，只用在 L2 的未來模擬。

1. **固定 hard/soft 門檻**：由全新 52 顆牌池的 representative states 以 exact L1 離線推得。`score=0` 固定 DRAW；terminal 固定 STOP；hard：`score < 12 DRAW、score ≥ 12 STOP`；soft（A 目前以 11 計）：`score < 17 DRAW、score ≥ 17 STOP`。
2. **剩餘牌池 composition 門檻**：以 exact L1 calibration points 建立 `(hard/soft、score、剩餘數分桶、10 點比例分桶)`；剩餘桶為 `<15、15–19、20–29、30–39、≥40`，10 點比例為 `<25%、25–34%、≥35%`，每格至少 5 筆，無足夠資料回退固定門檻。

300 個相同 seeded 週期的「近似策略 − exact L1」每局平均距離差：

| 策略 | L1 每局平均 | 策略每局平均 | 差值（策略−L1） | paired 95% CI | 決策查表時間 p50／p95／max |
|---|---:|---:|---:|---|---:|
| fixed hard/soft | 4.664931946 | 4.668184518 | +0.000325163 | `[-0.049948333, 0.050598659]` | 0.0001／0.0001／0.3309 ms |
| composition buckets | 4.664931946 | 4.691817639 | +0.025884804 | `[-0.028310299, 0.080079907]` | 0.0003／0.0008／0.3501 ms |

查表時間受 Node timer resolution 影響，不能解讀為手機實測。選擇 **fixed hard/soft**，理由是成對平均距離差較低、查表較便宜；兩者 CI 都含 0，這是原型選擇理由，不是證明近似策略等同 exact L1。

## D. Common random numbers

以選定 fixed 策略、5 個代表狀態、每個選項固定 2,000 rollouts 比較：DRAW／STOP 共用同一個 per-rollout seeded stream，對照獨立 stream。

- CRN 平均 CI width：**0.680980656**。
- 獨立亂數平均 CI width：**0.741346145**。
- 平均寬度縮減：**8.1427%**；5-state width-reduction 95% CI `[1.8207%, 14.1211%]`。
- p50 width：CRN 0.650974124；獨立 0.750690355。

## E. 序貫停止

- 上限：每個選項 2,000；本次保留最低 30 paired rollouts 後，CI95 一旦排除 0 即停止。
- 30 個狀態全完成；平均實際 rollouts／option：**301.97**；p50 **30**；p95 **2,000**。
- 提前停止：**27/30**；跑滿上限：3/30。
- 30-state L2 evaluation 總耗時 306.537 ms；平均每 state 10.191 ms。

序貫停止只節省已能判定方向的狀態；CI 仍以 95% CI gate 判斷，沒有把未完成或 CI 含 0 的結果當成顯著。

## F. 針對性抽樣與 500 個 L2 決策點

從 exact L1 fresh-cycle 軌跡收集條件 `|V(DRAW)-V(STOP)| < 1` **或**剩餘 15～20 顆的點，共 **800** 個；本次評估前 500 個，500/500 complete。

- L2 與 L1 相反：**28/500（5.6%）**。
- 相反且 CI95 不含 0、符合採用門檻：**15/500（3.0%）**。
- 所有 targeted L2 CI 排除 0：452/500。
- 實際 rollouts 平均 296.872；p50 30；p95 2,000。

特徵分布（全 500 點）：

- 剩餘數：`<15=6、15–19=322、20–29=92、30–39=42、≥40=38`。
- 分數：`1–8=110、9–12=206、13–15=68、16–18=78、19–20=38`。
- hard/soft：`hard=426、soft=74`。

相反點中，`<15=0、15–19=5、20–29=7、30–39=7、≥40=9`；採用點中，`<15=0、15–19=2、20–29=4、30–39=4、≥40=5`。採用點分數分布為 `1–8=0、9–12=8、13–15=1、16–18=6、19–20=0`，hard/soft=`9/6`。

三個典型採用例：

| remaining | score／型態 | L1 → L2 | draw−stop | CI95 | rollouts |
|---:|---|---|---:|---|---:|
| 27 | 16／soft | DRAW → STOP | 2.816684 | `[0.156418, 5.476950]` | 31 |
| 26 | 12／hard | STOP → DRAW | -1.728718 | `[-3.450261, -0.007175]` | 157 |
| 50 | 12／hard | STOP → DRAW | -0.931940 | `[-1.862857, -0.001022]` | 565 |

## G. 完整週期比較

使用 200 個 paired seeded cycles；pure L1 與 L1+L2 使用相同 `r3-compare-{cycle}` 牌序。L1+L2 每個當下決策先 exact L1，再依「相反且 CI95 排除 0」才採用 L2；未完成 L2 不採用。

- 完成：**200/200，L2 incomplete=0**；共 3,317（pure）／3,313（hybrid）局。
- pure L1 所有局平均 distance：**4.626469702**；每週期平均局數 16.585。
- L1+L2 所有局平均 distance：**4.653184425**；每週期平均局數 16.565。
- 改善定義為 `pure L1 − hybrid`：**-0.027134804**。
- paired 95% CI：`[-0.061032357, 0.006762749]`。
- 統計顯著改善：**否**；CI 含 0，且點估計略為變差。
- 7,462 個 L1 decision points 中，實際 L2 採用 28 次；L2 evaluated states 7,356、cache hit 106。

這是本輪最重要的週期層結論：targeted points 中確實找到可通過 CI gate 的相反點，但在完整 200-cycle paired comparison 上尚未證明改善。

## H. 即時可行性

Node 單執行緒與同一個持久 `worker_threads`（只啟動一次、連續送 30 個任務）測量選定 fixed 策略的單一 L2 decision：

| 執行方式 | p50 | p95 | max |
|---|---:|---:|---:|
| Node single-thread | 0.336 ms | 114.580 ms | 185.858 ms |
| persistent worker task latency | 0.846 ms | 140.736 ms | 271.816 ms |

- Worker startup：149.716 ms；不計入每個持久 task 的 p95。
- FR-13 `L2 p95 < 1s`：本次 Node worker timing **低於 1s**。
- 手機 `×4` 是推論，不是實機或 Playwright CPU 4×：single-thread p95 約 458.321 ms；persistent worker p95 約 562.945 ms，仍低於 1s 的粗估，但 max ×4 會超過 1s，不能宣稱實機通過。

## 失敗嘗試與邊界

- 單一長程序 λ 在執行器環境約 100～160 cycles 後會被中止，未產生完整結果；這些部分數字沒有用來宣稱完成。拆成絕對 seed 的短子程序後，20/20 chunks 驗證成功。
- 初版批次器的 `cmd set VAR=value &&` 讓輸出檔名多一個尾端空白；合併器後來兼容該檔名，新的 `run-r3-all.mjs` 改用環境物件／隔離子程序避免重現。
- 初次 G 因欄位名錯誤把 `pureSolver` 傳成非 `solver`，第 0 cycle 中止；已修正後重新執行，最終 200/200 complete。
- 所有中止都保留為未完成，不以 fallback 或縮小 rollout 冒充成功；沒有降低 `distance=22`、`<15`、當下 exact L1、2,000 rollout 上限或 CI gate。
- 未執行：Playwright CPU 4×、實體手機、真實遊戲補牌觀察、Supabase、正式 Web Worker／UI 整合。Worker 數字是 Node `worker_threads` 實測，不是瀏覽器實測。

## FR-13 具體修改條文建議

以下是供 Owner 決定的條文草案；本輪只修改 prototype，沒有直接修改 `docs/開發規格.md`。

1. **AC-14 拆分 L1／L2**
   - `L1` 驗收：每次當下決策必須用 exact expectimax；key 為 `(deck counts, lowTotal, hasAce)`；`4+7+6` 必須為 `STOP`、`stopDistance=4`、`drawExpectedDistance=15.755102040816325`（容差 `1e-9`）。
   - `L2` 驗收：只驗證 seeded result、rollout count、CI 與採用 gate；L2 不得改寫 L1 的 exact current-step requirement。L2 沒有足夠證據時 UI 維持 L1。

2. **L1 cache 生命週期**
   - 新增 `RoundPolicyCache`：每局開始建立或清空，局末清空；不得使用跨局／跨週期無上限 shared cache。
   - cache value 保存 exact value、`DRAW/STOP`、`stopDistance`、`drawExpectedDistance`；key 不得加入手牌順序。
   - 每局 cache／時間上限只能產生明確 `COMPUTATION_LIMIT`；當下步驟不可偷偷改用近似策略。

3. **L2 rollout 策略定義**
   - 初版 `FutureRoundPolicy` 採 fixed hard/soft：`score=0 DRAW`、terminal STOP、hard `12` 起 STOP、soft `17` 起 STOP。
   - 這個策略只用於 forced current action 之後的模擬；當下 action 仍由 L1 提供。
   - composition buckets 本輪平均差較差，先不列為產品預設；可保留研究用 calibration，不寫入產品資料模型。
   - 週期比較結果未顯著改善，因此文案不可稱「最佳化」或「保證提高分數」。

4. **λ 常數**
   - 將 `FRESH_DECK_BASELINE = 4.631719382401439` 作為可寫入候選，附本報告、2,000 cycles、33,355 rounds、seed 及產生腳本。
   - 修改 L1、`BURST_DISTANCE` 或補牌邊界後必須重新產生；不可手動沿用舊 λ。

5. **rollout、CRN 與序貫停止**
   - 每選項最多 2,000 paired rollouts；DRAW／STOP 使用 common random numbers。
   - 至少累積 30 paired samples 後，CI95 排除 0 即可提前停止；否則跑滿 2,000。
   - 保留 `drawMinusStop`、CI、seed、實際 rollouts、`stoppedEarly`；只有 L2 與 L1 相反且 CI95 不含 0 才採用。

6. **COMPUTATION_LIMIT 回退**
   - L2 timeout、Worker cancellation、cache／時間上限或 incomplete rollout 都回傳 `COMPUTATION_LIMIT`，丟棄過期結果並維持 L1；不得把 incomplete 當成 0 差異、STOP 或成功。
   - 新輸入到來時取消舊 Worker 任務，UI 先顯示已可用的 L1。

7. **Worker 常駐與效能目標**
   - 使用一個可重複送任務的常駐 Worker，而不是每個 decision 重開 Worker；任務需有 request id、取消與過期結果檢查。
   - 保留 `L2 p95 < 1s` 目標；本輪 Node persistent worker p95=140.736 ms，但 ×4 與瀏覽器效能仍須另做人工／Playwright 驗收。

8. **資料邊界與產品宣稱**
   - L1/L2 recommendation 只由目前狀態重算，不寫入 Supabase 或本機歷史；cache 可丟棄。
   - L2 的 seeded CI 是當次計算證據，不是規則觀察，也不取代 FR-03 的補牌紀錄。
   - 完整週期比較目前無統計顯著改善，FR-13 應把 L2 定義為受 CI gate 保護的週期修正候選，不宣稱已證明優於 L1。

## 實測／推論分界與交付

- **實測**：Node v22.14.0、exact L1 cache states／時間、no-memo 誤差、計分案例、λ、策略差值與 CI、CRN、序貫停止、targeted features、paired cycles、Node worker timing。
- **推論**：手機 `×4`、是否需要正式 UI Worker、真實遊戲是否依 `<15` 補牌；本報告沒有把推論寫成遊戲事實。
- 本輪未執行 git commit／push，未修改 docs／README／AGENTS／tickets。
- 報告絕對路徑：`D:\Codex\dv3-dito-web\.scratch\recommender-prototype\REPORT-round3.md`
