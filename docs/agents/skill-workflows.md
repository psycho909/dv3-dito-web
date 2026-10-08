# Skill Workflow Adaptation

只在選擇或執行 Skill 時讀取。本文件定義外部 Skill 與本專案的接合方式，不複製完整 Skill，也不授權安裝、全域設定修改、額外寫入或外部發布。

## 1. 選擇來源與作用範圍

先用目前 Session 的可用 Skill 清單確認完整識別名稱。使用者明確指定的版本優先，其次 README 的專案選擇；未指定時採下表首選。首選不可用時採專案等價流程，不憑短名稱猜另一套同名版本。記錄實際選用的名稱及版本（若可取得）於目前 Ticket Evidence 或 L1 回報；不新增逐回合紀錄。

表中的 `matt-skills-curated:<name>` 是 plugin Skill 的完整名稱；未帶 prefix 的項目指可用清單中同名的個人 Skill。兩者可能不同。已安裝但未列入可用清單，或標記 `disable-model-invocation` 的 Skill，不視為可自動呼叫的能力。使用者明確指定該 Skill 時仍依平台允許方式讀取。

| 工作流 | 首選 Skill | 觸發條件與最低產出／fallback |
| --- | --- | --- |
| 拆票 | `matt-skills-curated:to-tickets` | 已核准規格需要多個可獨立驗收單位；依 Ticket Convention 輸出 `tickets/*.md`、Acceptance 與 blocking edges。單一小修不拆票。 |
| 實作 | `matt-skills-curated:implement` | 已核准的多步驟實作；依工程方法完成 Scope、相稱驗證與 review。純文件小修直接執行。 |
| 診斷 | `diagnosing-bugs` | 原因未知、複雜、不穩定或反覆失敗；依工程方法保存症狀、可證偽假設、最小修復及回歸結果。已知原因局部修正可省略無助於判斷的階段。 |
| TDD | `matt-skills-curated:tdd` | 行為變更且存在允許、可執行的測試 seam；保存預期原因的 RED 及 GREEN 證據。無 seam 時採相稱替代驗證，不能稱為 TDD。 |
| 需求對齊 | `matt-skills-curated:grill-with-docs` | 重大歧義且需要沉澱共識；先查事實，再詢問尚未決定的事項；依 Domain Convention 保存已確定的語彙與必要 ADR。純討論／唯讀請求只回報，不自行寫文件。 |
| 一般 review | `matt-skills-curated:code-review` | 範圍與限制一律依 [Review 規範](review.md)；產出 Standards、Spec、證據及未檢查部分。Fallback 保留兩個檢查面向，不強制兩個 Agent。 |
| 簡化 | `ponytail` | 明確簡化、依賴選擇或過度設計疑慮；依工程方法選出滿足契約的最小正確方案及必要驗證。 |

只讀取選定 Skill 的完整入口，再沿觸發分支讀所需文件；不把所有 workflow 或相鄰 Skill 全部載入。作用範圍限本次已授權工作，完成或轉為不相關任務後不延續 Ponytail 模式；使用者另有明確要求時依其範圍。Skill 的持續模式與輸出限制不得取代使用者請求、專案 Scope、完整證據或必要解釋。

## 2. 專案契約覆蓋點

外部 Skill 是方法參考；已核准的 Scope、資料安全、權限及本專案驗證要求仍是約束。下列已知差異直接採專案適配，不因措辭不同重問已明確授權的步驟；無法在既有保障內解決的衝突才記錄阻塞。

當已讀 Skill 實際導致停頓、額外確認、留下未完成工作或偏離使用者意圖時，於回報附上該 Skill 完整名稱、確切 SKILL.md 路徑（可用時提供連結）、相關短引文、適用理由與處理方式；若依據在引用文件，另標示該文件位置。區分 Skill 明文要求與 Agent 自身解讀，讓使用者能追查原因；不把工具錯誤或權限不足誤稱為 Skill 要求。

既有適配足以解決時直接繼續已授權工作，不因揭露而新增批准關卡；仍需新權限、Scope 或決策時，只暫停受影響部分並說明解除條件。同一原因與處理方式未變時不重複揭露；未觸發時不印檢查清單，引用不得包含憑證或敏感資料。

| 外部流程差異 | 本專案執行方式 |
| --- | --- |
| tracker、`.scratch/.../issues/`、`ready-for-agent` | 唯一 Work Authority 為 [Ticket Convention](../../tickets/README.md)；不另建 tracker 設定、不自動發布 Issue。用專案 draft／approved 等狀態；規格已核准不代表新增 Scope 自動核准。 |
| 要求 `docs/agents/issue-tracker.md` 或 setup Skill | 讀取 [Work Authority](work-authority.md)及目前 Ticket；缺少外部 tracker 文件不是本專案缺陷。 |
| `CONTEXT.md`、`skills/domain-modeling/*` 的錯置相對路徑 | 位置依 [Domain Convention](domain.md)。格式參考先在選定 Skill 所屬套件的 sibling `domain-modeling/` 找 `CONTEXT-FORMAT.md`／`ADR-FORMAT.md`；確實不存在時使用下述最低格式，不建立假的參考文件。 |
| 每檔 typecheck、每 slice 全套、固定新測試／基礎設施 | 按根 AGENTS 驗證工作單位與風險。TDD 見工程方法；先重用允許的測試，新增 runner／依賴仍需 Ticket 或專案授權。 |
| baseline 有既有失敗就禁止施工 | 先記錄可重現 baseline，區分既有與本次失敗；不影響本次驗收的既有問題可列剩餘風險，必要證據被阻斷才停該部分。 |
| 每個 seam 重新詢問、固定分批提問 | Ticket／使用者已批准的 seam 與契約可直接使用；只有未定且影響結果的選擇才詢問。需求對齊沿用專案的一次一個簡短問題及必要解釋。 |
| 最短 diff、單行優先、先交簡化版再詢問 | 以完整 Acceptance、可讀性與正確性為界；不刪除錯誤處理、安全、資料完整性、無障礙或必要測試來縮短。 |
| 固定 `general-purpose`／雙 Agent review、提交後 diff 用於提交前 | Agent 選擇依 [Subagents](../SUBAGENTS.md)，檢查範圍及 fallback 依 [Review 規範](review.md)。 |

Domain 格式 fallback：CONTEXT 記錄已確認的名詞、定義、關係／不變量與來源；ADR 記錄 Context、Decision、Status、Consequences 與批准依據。只在存在真實共享知識或重大決策時建立於專案指定位置。

## 3. Ponytail 延伸命令

以下名稱只代表可選能力；先確認目前是否可用，不把不存在的 slash 命令當作已執行。不可用時依本表產出即可，不安裝工具、不阻塞正常工作。

| 名稱 | 觸發 | 等價產出與完成條件 |
| --- | --- | --- |
| `ponytail-review` | 待交付 diff 疑似過度設計 | 候選簡化清單，每項附位置、理由、契約與驗證影響；查無問題可為空。只是建議，不授權刪除、不取代 Standards／Spec review。 |
| `ponytail-audit` | 明確 repository-wide 過度設計／技術債審查 | 已檢查範圍、按風險排序的證據與建議；保持唯讀，修改另依授權。 |
| `ponytail-debt` | 整理已存在的 `ponytail:` 延後項目 | 位置、已知限制、升級觸發與目前是否成立；無項目就回報無，不創造新債務。 |
| `ponytail-gain` | 使用者要求量化效益 | 同一口徑的基準／結果、量測方法及限制；缺少量測只列待測，不從字數、行數推算模型速度或成本。 |

## 4. 工具與完成證據

腳本先確認來源與用途，再找目前環境可執行的 runtime；不把 Windows PATH 缺項視為腳本損壞。`diagnosing-bugs` 的 `scripts/hitl-loop.template.sh` 是互動模板，需依實際重現步驟填寫副本並有 Bash 與人類操作入口；`bash -n` 只代表語法通過，不代表 bug 已重現。不要求所有專案新增腳本，也不無故重寫仍可用的工具。

完成條件：實際採用來源或 fallback 已明示、產出位於專案正本、所需驗證有證據、不可用能力及未檢查風險已記錄。只通過文件或 parser 檢查，不宣稱 Skill 自動觸發、模型委派或效能已通過實測。
