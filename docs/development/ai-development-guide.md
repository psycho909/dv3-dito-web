# AI Development Guide

本文件供行為變更、跨模組與未知原因除錯按需讀取。根 `AGENTS.md` 定義不可降低的結果底線；純文件小修不需要完整工程流程。

## 1. Preflight

先讀取與任務直接相關的規範、Requirement／Ticket、模組結構、程式碼、呼叫鏈、依賴、契約與參考實作。證據不足時才擴大閱讀範圍。

動手前回答：修改什麼、為何修改、最小正確解法是什麼、如何驗證。存在多個合理方案時，比較 trade-off 後選擇最符合現有架構的簡單方案。

## 2. 文件化歧義

需求、Domain、架構或契約有重大歧義時，依 [Skill 適配](../agents/skill-workflows.md)選擇對齊流程；既有契約能回答的事項自行確認。已批准工作內可自行選擇可逆的實作細節；需要新的產品／架構／安全決策時才詢問。文件位置與建立條件以 [Domain Convention](../agents/domain.md)為準，唯讀請求不自行沉澱文件。

## 3. Surgical Changes

只修改當前 Scope 直接需要的內容。自身變更造成的 unused imports、variables、functions 或失效產物必須清理；既有且無關的格式、註解、重構與 dead code 保持不動。

## 4. Ponytail Lazy Ladder

新增程式碼前依序檢查，於第一個成立的階梯停止：

1. **YAGNI：** Requirement 並不需要時不實作。
2. **Reuse：** 既有實作可滿足時直接重用。
3. **Native：** 語言標準庫或平台能力可滿足時直接使用。
4. **Existing dependency：** 已核准依賴可滿足時直接使用。
5. **Simple implementation：** 以上皆不適用時，建立最簡單、可讀且可驗證的最小實作。

簡化不得移除安全驗證、錯誤處理、資料完整性、權限檢查、Accessibility 或必要測試。

## 5. Debugging Discipline

先用症狀與現有證據判斷深度：原因明確的局部錯誤可直接最小修復及回歸驗證，不強制多個假設、插樁或建立新 harness。原因未知、複雜、不穩定或反覆失敗時，依序執行適用階段：

```text
Reproduce → Minimize → Falsifiable Hypothesis → Instrumentation → Fix → Regression Verification
```

先取得能區分失敗／成功的證據，再依可證偽假設選擇最小修復；已存在的測試／重現命令優先重用，不為湊流程強制列 3–5 個假設。回歸驗證遵守根 `AGENTS.md` §6、README 與 scoped 限制；只允許靜態檢查時可繼續唯讀追蹤原因，分開標記已知事實、未驗證假設與剩餘風險，不冒充 runtime 修復證據。若 Acceptance 必須 runtime 才能證明，該項維持未完成並列取得證據的下一步。

同一假設路徑連續兩次驗證失敗時，套用 **Two-Strike Rule**：停止嘗試，重新檢查原始假設、新證據、插樁與實際錯誤；形成可被證偽的新假設後才繼續。

這是重評假設，不是必須請 Owner 再批准已授權的修復。根 Output style 的連續三次修復失敗則停止當前修復路徑並回報可疑假設；需要新決策或必要證據不可取得時才標記 `blocked`，不機械重試同一方法。

## 6. TDD

只有行為變更存在專案允許且可執行的自動化測試 seam 時才使用 TDD：先建立能重現目標行為且因預期原因失敗的測試（RED），再完成使該測試通過的最小實作（GREEN），最後在相關測試保持通過時重構（REFACTOR）。不得先實作再補測試、放寬斷言或改寫預期結果來迎合實作。

沒有可執行 seam 時，不宣稱使用 TDD；改依根 `AGENTS.md` §6 執行相稱的替代驗證，並記錄不適用原因與剩餘風險。新增 test runner、依賴或瀏覽器測試基礎設施前，必須有目前 Ticket 或專案規則授權；scoped `AGENTS.md` 可以進一步限制允許的測試工具。

已在 Ticket／既有契約確定的 public seam 可直接沿用，不逐個測試重問。REFACTOR 僅處理該工作單位必要且在 Scope 內的改善；沒有必要時省略。不要為文件或不影響行為的小修新增測試，也不固定每個 RED／GREEN cycle 都執行全套驗證。

## 7. 驗證與證據

證據優先序通常為 Runtime、Test、Type Checker、Linter、Build、Git Diff 與 Git History。先執行最接近變更的驗證，再依風險擴大；本機或 mock 驗證不得冒充 hosted、production、權限或跨使用者驗收。

完成回報只提供適用的客觀結果，例如 Result、Command、Exit Code、Commit／PR（若已授權）與 Known Risk。

## 8. Silent DoD

宣告完成前，Agent 必須自行確認 Scope、契約、依賴、最小變更、驗證與剩餘風險。完整 Checklist 留在 Agent 內部；證據不足時不宣稱完成。
