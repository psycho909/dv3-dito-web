# FR-13 推薦引擎原型驗證報告（ROUND 2）

> **PROTOTYPE／throwaway**：本報告與程式只回答 FR-13 演算法研究問題，全部位於 \.scratch\recommender-prototype；不是產品程式、不是產品依賴，不修改任何正式規格，也不寫入 Supabase。

## 執行摘要

- Round 2 的單一核心變更：將 L1 exact expectimax 的 memo 與 action policy 改成跨 rollout、跨決策點共享的 canonical cache；key 只含 '(deck counts, lowTotal, hasAce)'，不含手牌順序。
- Node：v22.14.0；平台：Windows x64；CPU：Intel(R) Core(TM) Ultra 7 165H；logical CPUs：22。
- 本輪重現命令：node --expose-gc .scratch/recommender-prototype/run-round2.mjs（repo 根目錄）。僅使用 Node.js built-ins 與純 JavaScript .mjs，未安裝套件。
- 本次總執行時間：0.360 s；結果由本次執行產生。
- 規則固定：52 顆牌、等機率不放回、A 的 1／11 算法、BURST distance=22、下一局開始前且剩餘 '<15' 才換新 52；L1 exact、L2 只在與 L1 相反且 CI95 排除 0 時採用。

## 1. Round 1 瓶頸與 Round 2 變更

Round 1 已知結果：fresh-empty 7,580 memo states／14.726 ms；L1 2,033 個局面中止 5 個；跨局只完成 8/3,000 決策點，而且只取剩餘 '<15' 邊界；L2 反覆在 rollout 內解 L1，最後觸發約 100,000 memo states／5 秒與 solve-call budget；'lambda=4.492753623' 只來自 4 cycles／69 rounds，不能採用。

本輪不以提高 caps 當解法。改用一個共享 canonical cache：

1. cache value 同時保存 exact value、STOP／DRAW action、兩個期望距離，rollout 只查已知 policy。
2. cache key 使用混合進位的 deck-count code 加 lowTotal／hasAce；相同牌池與 A 狀態不因手牌順序重算。
3. phase budget 只作安全停止；任何中止都標成 incomplete，不當成完成。正式 L2 保持每個選項 2000 rollouts，不降為 256。
4. 另以獨立 no-memo 小牌池 oracle 檢查週期邊界，並量測 Node 單執行緒與可終止 worker_threads 的差異；這些是研究證據，不是產品實作。

## 2. L1 效能與共享 cache（實測）

| 類別 | 樣本 | 完成 | 中止 | shared unique p50 | shared unique p95 | shared unique max | cache hit rate | time p50 (ms) | time p95 (ms) | time max (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| fresh-empty | 1 | 1 | 0 | 7,580 | 7,580 | 7,580 | 51.652% | 3.024 | 3.024 | 3.024 |
| low-score-many-small-pip | 39 | 39 | 0 | 0 | 8 | 3,828 | 60.387% | 0.002 | 0.017 | 3.188 |
| fixed-4-7-6 | 5 | 5 | 0 | 0 | 0 | 0 | 100.000% | 0.001 | 0.012 | 0.013 |
| random-legal | 1000 | 1000 | 0 | 2 | 9 | 16 | 57.086% | 0.001 | 0.005 | 0.016 |

- L1 benchmark 總計：1045 個合法局面；完成 1045；中止 0。
- fresh-empty：DRAW；7,580 個本次新增 canonical states；耗時 3.024 ms；累積 shared cache 7,580 states。
- round-2 performance cache 最終：14,235 unique states；累積 cache hit 14,596、miss 14,235；solve calls 28,831。benchmark 期間 heap 最後約 7.88 MiB。
- 完成樣本 p95：0.005 ms；乘需求的 ×4 手機粗估為 0.022 ms。這不是 Playwright CPU 4× 或實機測量；只要有中止，就**不能宣稱 FR-13 L1 p95 已達標**。
- 記憶體是 Node process heap snapshot／delta，不是精確逐 entry allocation；唯一狀態數是可重現的 cache size。

- Round 2 瓶頸 verdict：**部分改善但未解決**。在限定 L1 benchmark 中 0 個中止，decision points 從 Round 1 的 8 增至 338，且邊界 cache 探索 0.347 ms → 0.094 ms；但仍未達 3,000 points、2,000 fresh cycles 或 full-cycle comparison，shared canonical cache 只把狀態爆炸延後，沒有消除它。

### Round 1 對照（實測舊報告）

- Round 1 fresh-empty 是 7,580 states／14.726 ms；Round 2 fresh-empty 的實際數字見上表。
- Round 1 5 個 L1 局面中止；Round 2 的完成／中止以本輪上表為準。
- 不能用「cache hit 變高」替代 exact correctness；下面仍執行 1,000 組 no-memo 對照。

## 3. L2 決策點收集與正式價值測量

- Fresh-cycle L1 baseline 目標：2000 cycles；完成 9；未完成（L1 budget exceeded: phase fresh-baseline-and-decision-collection new states>=200000）；觀察 149 rounds。
- L1 policy decision points 目標：3000；實際收集 338；未完成。樣本包含所有 remaining buckets，而不是只收 '<15' 邊界。unique canonical decision states：336；實際 feature 分布：remaining：<15 18、15–19 42、20–29 80、≥30 198；score：1–8 103、9–12 110、13–15 48、16–18 42、19–20 35。
- baseline shared cache heap：7.89 MiB → 43.06 MiB；這是 process heap snapshot，不是逐 entry allocation。
- 正式 L2 每個 state／option：2000 rollouts。選取 3 個代表狀態，完成 3/3；整體正式測量：**完成**。這是因 shared-cache safety blocker 後的 bounded representative sample，不是全 3,000 decision points 的 L2 覆蓋。

| # | remaining | score | L1 | rollouts | L2 | draw-stop | CI95 | 狀態 |
|---:|---:|---:|---|---:|---|---:|---|---|
| 1 | 14 | 4 | DRAW | 2000/2000 | DRAW | -10.892500 | [-11.001752, -10.783248] | 完成 |
| 2 | 19 | 6 | DRAW | 2000/2000 | DRAW | -10.249181 | [-10.513809, -9.984554] | 完成 |
| 3 | 29 | 7 | DRAW | 2000/2000 | DRAW | -9.317094 | [-9.809822, -8.824366] | 完成 |

- 在已完成的 3 個正式狀態中，L2 與 L1 相反 0 個（0.000%）；CI95 排除 0 的狀態 3 個；同時相反且符合採用門檻 0 個（0.000%）。若正式狀態未全完成，這些比例只代表 completed denominator，不能外推所有決策點。
- 相反狀態 features：remaining：<15 0、15–19 0、20–29 0、≥30 0；score：1–8 0、9–12 0、13–15 0、16–18 0、19–20 0。
- 實際採用狀態 features：remaining：<15 0、15–19 0、20–29 0、≥30 0；score：1–8 0、9–12 0、13–15 0、16–18 0、19–20 0。
- 正式 CI width p50／p95／max：0.529255／0.939836／0.985456。

## 4. FRESH_DECK_BASELINE lambda

- 產生方式：9 個 seeded fresh 52-card cycles，所有局都依 exact L1；cycle 在 round 結束後 remaining '<15' 時結束。
- λ = **4.536912752**；局級平均 distance 95% CI [3.960528, 5.113298]；每週期平均 rounds 16.555556，95% CI [15.979370, 17.131741]。
- 官方寫入建議：**本輪未達到預先宣告的 2,000-cycle 樣本，λ 只能是 provisional，不能寫入正式 FR-13 常數。**
- 修改 L1、BURST_DISTANCE 或補牌邊界後必須重算；本報告不修改正式規格。

## 5. 獨立 full-cycle pure L1 vs L1+L2

- 預先設定 comparison target：10 個獨立 cycles；實際完成 0；狀態：**未完成**。
- pure L1 每局平均 distance：NaN；L1+L2：NaN。
- 改善（pure L1 − L1+L2）：NaN；paired 95% CI [NaN, NaN]。
- 實際 round 數：pure L1 共 0（每週期平均 NaN）、L1+L2 共 0（每週期平均 NaN）；本原型沒有把未完成週期外推成改善；若狀態為未完成，正式結論是 **not completed**。
- L2 on-demand cache states：1。hybrid 只在每個實際決策點以正式 2000 rollouts 評估，且僅在 CI gate 通過時改變 L1 action；L2 未完成即中止該 comparison，不 fallback 後冒充完整比較。
- 中止原因：full-cycle L2 state incomplete: L1 budget exceeded: shared cache states>=250000。

## 6. cache、single-thread／Worker 分離測量

### shared cache 對 Round 1 independent memo 的同口徑探索

- 每組 16 個 rollout pair；此段是 cache bottleneck comparison，不取代正式 2000 L2。
- Round 1-style 每個 rollout 建立獨立 memo：完成 16；耗時 0.426 ms；累積 states 873；hit rate 31.314%。
- Round 2 shared canonical policy cache：完成 16；耗時 0.108 ms；累積 states 1,497；hit rate 44.801%；final shared states 98。
- 這項比較固定 rollout pair 數且不放寬規則；實際正式 L2 完成性仍以上一節為準。

### worker_threads（探索性、不是正式 p95）

- 128 rollouts／option，同一 state／seed label；single-thread：0.207 ms，128/128；worker_threads：57.209 ms，128/128；結果欄位相同：是。
- worker 可被 timeout terminate；worker startup／structured clone／獨立 cache 會有成本。這只支持 FR-13 產品仍需 Web Worker 隔離 L2，不代表瀏覽器 Worker p95 已通過。

## 7. 正確性與可重現性

- §3 十個 score cases：通過（10/10）。
- 1,000 組 independent no-memo L1 comparison，remaining ≤12：mismatch 0；最大 expected-distance absolute error 0（要求 ≤1e-9）。
- 4+7+6：recommendation **STOP**；stopDistance 4；drawExpectedDistance 15.755102040816；通過。

### 4+7+6 下一抽分布

| 下一抽 | 剩餘 | 抽後分數 | tier | 機率 |
|---|---:|---:|---|---:|
| A | 4 | 18 | GOOD | 8.1632653061% |
| 2 | 4 | 19 | GREAT | 8.1632653061% |
| 3 | 4 | 20 | GREAT | 8.1632653061% |
| 4 | 3 | 21 | PERFECT | 6.1224489796% |
| 5 | 4 | 22 | BURST | 8.1632653061% |
| 6 | 3 | 23 | BURST | 6.1224489796% |
| 7 | 3 | 24 | BURST | 6.1224489796% |
| 8 | 4 | 25 | BURST | 8.1632653061% |
| 9 | 4 | 26 | BURST | 8.1632653061% |
| 10 | 16 | 27 | BURST | 32.6530612245% |

級距 counts：PERFECT=3/49、GREAT=8/49、GOOD=4/49、NORMAL=0/49、BURST=34/49；符合 FR-04／§6。

### small-deck full-cycle oracle（獨立、縮小模型）

- oracle deck=[1,1,1,1]、values=[2,3,4,5]、reset threshold=2；這是為了可窮舉驗證週期邊界，不是 52-card λ。
- exact fresh expected cost=7.000000000、expected rounds=1.000000000、λ=7.000000000。
- 代表 state draw centered cost − stop centered cost=-14.000000000，exact action **DRAW**；2000 seeded rollout mean=-14.000000000，CI95 [-14.000000000, -14.000000000]，rollout action **DRAW**；方向一致：**是**。
- 限制：縮小牌池與 threshold 不是正式玩法；此處只驗證「局末 remaining < threshold 才進下一局／週期結束」的遞迴邊界。

### seeded L2 determinism／seed sensitivity

- 同 state + 同 seed 的 L1：相同；L2：相同。deterministic 只代表可重現，不代表沒有 sampling error。
- seed sensitivity：完成 1/1 states；每 option 2000 rollouts、5 seeds；相對第一個 seed 翻轉 0/4（0.000%）；有任一翻轉的 state 0。即使觀察到 0 翻轉，也不能稱無抽樣誤差。

## 8. 失敗嘗試、邊界與可驗證性

- Round 1 failed attempt：每個 cross-round rollout 重新觸發 L1 狀態擴張，導致 8 個邊界點後 budget abort；該結果不當成功。
- Round 2 failed attempt：曾將 shared cache safety cap 留在 850,000 states，執行在 formal L2／worker 前後出現無可靠 stack trace 的 process termination；因此本輪採 250,000 global／200,000 baseline safety cap，並把高 cap 結果視為失敗嘗試，不宣稱完成。
- Round 2 safety stops：2 個效能／研究單位標記為中止（若有）；原因與實際 completed counts 已保留在上文，不重新解釋為成功。
- 可觀測 boundary：exact L1 的狀態空間仍會因「不同週期已消耗牌＋目前手牌」增長；shared cache 能重用相同 canonical state，但不能把未知 state 變成近似 policy。達到 cache／時間上限時只能回傳 L1 已知結果或 COMPUTATION_LIMIT，不能降低 distance=22、'<15'、exact L1、2,000 rollout 或 CI gate。
- 實測項目：Node runtime、shared cache size／hit rate、時間、完成／中止、L2 CI、lambda、full-cycle sample、score／brute／oracle 數字。
- 推論／未執行：×4 手機估算、產品 UI Worker 排程、Playwright CPU 4×、真實遊戲補牌觀察、Supabase、正式 FR-13 整合；本輪沒有把它們寫成通過。

## 9. FR-13 下一步修改建議（本輪不修改正式規格）

1. **實作 seam：**在 recommendation engine 建立生命週期可控的 shared canonical L1 policy cache；key 固定為牌池 counts、lowTotal、hasAce，並保存 value/action。L2 rollout 不可各自建立獨立 memo。
2. **L2 交付契約：**保留每 option 2,000 rollouts、seed、draw-stop、CI95 與「只在 opposite + CI excludes 0 才採用」；Worker 任務取消時丟棄過期結果。若 cache／時間限制達到，回傳 L1 或明確 'COMPUTATION_LIMIT'，不能把未完成 L2 當成 0 差異或成功。
3. **lambda：**只有本輪達到 2000 fresh cycles 才可考慮寫入正式常數；目前狀態為 **provisional，不應寫入 FR-13**。每次 L1／distance／boundary 改動都重算。
4. **週期邊界：**沿用「round 結束後 remaining '<15'，下一局／週期才換新 52；remaining=15 不換」；small oracle 通過只代表邏輯方向，不取代真實遊戲觀察。
5. **效能驗收：**Round 2 若仍有中止，FR-13 不應宣稱 L1 p95 達標；L2 維持 Worker，先顯示 L1，再以可取消 seeded task 補正。這不是把 L2 從 V1 移除；主 Agent 需決定 computation-limit UI 是僅保留 L1，或限制可套用 L2 的狀態範圍；原型不擅自縮小 V1。
6. **資料邊界：**推薦結果仍只在記憶體重算，不寫入 session／Supabase；cache 可丟棄、seed／CI 供當次 UI 結果使用。

## 10. 重現參數

- L1：fresh、low-score/many-small-pip、fixed 4/7/6、1000 random legal states；phase safety 500 ms／250000 new states per case。
- Fresh baseline：目標 2000 cycles；decision points 目標 3000；formal L2：2000／option／state、3 states。
- Full-cycle comparison：目標 10 cycles；worker/cache comparison 為探索性，不冒充正式樣本。
- 本報告未執行 git commit／push；依本 prototype 任務限制保留在 scratch。
