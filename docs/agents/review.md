# Review Contract

交付前讀取；一般 review 檢查 Standards 與 Spec，不授權修改 Scope、提交、發布或改動外部設定。角色對應見目前 README；只有觸發 Independent Audit 時要求獨立施工 context。

## 1. 固定審查範圍

先記錄 Ticket／已授權 L1 請求、基準 commit、目前 HEAD、待交付檔案及實際 diff 命令。範圍須符合本次任務，混合工作樹只選本次路徑。提交前 review 必須包含未提交內容：

| 對象 | 唯讀檢查 |
| --- | --- |
| staged | `git diff --cached -- <paths>` |
| unstaged | `git diff -- <paths>` |
| 尚未追蹤的新檔 | `git ls-files --others --exclude-standard` 後完整讀取本次相關檔案；二進位使用相稱檢查 |
| 已提交的分支差異 | 確認已解析的 `<base>` 後，`git diff <base>...HEAD -- <paths>` |

`<paths>`／`<base>` 是待填參數，不原樣執行。`git diff <base>...HEAD` 只涵蓋已提交內容，不能代替前三項。若有已提交修改加未提交修改，四者按範圍組合；某一命令為空不代表整個工作無變更。檔案部分 staged 時，分別核對 staged 內容及工作樹最終內容，並確認實際交付的版本已被 review。

獨立 reviewer 必須能讀取上述實際內容：共享工作樹先凍結審查範圍；隔離環境需提供精確 patch、新檔內容與基準，或已獲授權且未發布的 checkpoint commit。只傳 HEAD SHA 給隔離 reviewer 不包含未提交工作。不要為取得 review diff 而先 push。

## 2. 深度與獨立性

風險定義見 [治理規範](../governance/ai-governance.md)；本節只定義 review 的執行與失敗處理。

| 風險／要求 | 最低 review | Reviewer 不可用／未完成時 |
| --- | --- | --- |
| L1，未另要求獨立 | 主 Agent 自查相關 Standards、Acceptance 與驗證；不強制拆成兩個 Agent | 記錄實際自查結果即可；不能稱為獨立 review |
| L2，未觸發 Independent Audit | 優先獨立 reviewer，可由未參與施工、符合 [Subagent 規則](../SUBAGENTS.md)的 GPT-6 Luna Max 執行明確 Spec／Standards 檢查，主 Agent 最終驗收 | 記錄不可用原因／已試方式；主 Agent 分開完成兩個面向及風險驗證，可按本規則結案，明示非獨立 fallback |
| L3，或 Owner／專案明確要求 Independent Audit | 未參與施工的獨立 Auditor，角色／模型依 README；L3 另需 Owner 最終核准 | 缺少必要 Audit 時維持 `blocked`，保留已完成證據；不能以施工者自查代替 |

無需把一般 review 固定拆為 Standards／Spec 兩個 Agent；兩個面向都要有結果。Timeout、未讀到 diff、新檔缺失、工具失敗或中途停止只算未完成。需要修正的 finding 記錄位置、依據、影響與解除條件；已授權範圍內自行修正及重驗，新增權限／Scope 才交由 Owner 決策。

## 3. 證據與結案

一般 review 保存於目前 Ticket Evidence（L1 無 Ticket 時為最終回報），至少包含：

- Scope：基準／HEAD、staged／unstaged／新增檔案的涵蓋範圍與命令；快照可用 Git blob hash 或內容指紋識別。
- Reviewer：實際角色、已知模型及是否參與施工；不得從 nickname 推測模型。
- Standards／Spec：各自結果、證據與尚未解決 finding；未檢查項目不能寫 PASS。
- Verification：實際命令、結果、限制及風險；哪些是文件檢查、哪些是 runtime 證據。
- Disposition：可接受、需修正或阻塞，及理由／下一步。

只有觸發 Independent Audit 才建立 `reports/audit/<task>.md`，內容沿用上述契約，另記錄獨立性與 Owner 核准證據（如需）。不為小任務建立空報告。

Review 後內容有變動，至少補查變動及其影響；必要時由相同獨立角色重查。純 Ticket 結案／證據追加可由主 Agent 核對，但不得藉此更動未經 review 的工程規則。最終 staging 後確認待提交檔案及內容與已審查快照一致，再依 README／Ticket 完成 commit、push；新檔不能因一般 diff 未顯示而漏交付。

完成條件：實際交付內容已涵蓋、必要獨立性與 Owner 權限已滿足、阻擋驗收的 findings 已修正並驗證、未檢查部分與剩餘風險已明示。Review 通過不等於已完成遠端同步。
