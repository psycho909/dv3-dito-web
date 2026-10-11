# 12 本機版 V1 總驗收

- Status: blocked
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-08 Owner 要求「開始進行開發」並核准拆票「照這樣拆」
- Risk: L2
- Updated: 2026-10-11
- Branch: work
- Git / Remote authority: 依 README；不含 PR、部署

## Goal

確認本機版 V1 端到端可用，所有證據齊全，可以交給部署與雲端階段。

## Scope

- `docs/開發規格.md` §5 e2e（雲端項目除外）：PC 4/7/6 → 完成 → 新局仍 49；手機 375 單手流程；重新整理；UNSYNCED 警示；鍵盤。
- 完整執行 lint、typecheck、unit、build、e2e 並收集證據。
- README：手動同步玩法、待確認遊戲規則清單。
- 手機與桌機人工驗證一次完整跨局操作。

## Out of Scope

- 部署（D1）、Supabase（S1～S5）。

## Acceptance

- [x] 01～11 全部 accepted。
- [x] 五個驗證命令全部通過，有可重現紀錄。
- [x] `docs/UIUX Design.md` §11 驗收清單中非雲端項目全部勾選並附證據。

- [ ] 手機與桌機人工驗證一次完整跨局操作，含撤銷、15／14 臨界值與 UNSYNCED；手機另確認單手可達性（原 Scope 明列）。

## Constraints and Decisions

- 未執行的檢查不得記為通過。
- 本票驗收僅本機；原規格完整 V1 的雲端 Auth／RLS／備份／衝突及部署由後續票處理，不因本票自動化通過而宣稱整體雲端 V1 完成。
- 人工跨局／實體單手操作不能用 Playwright viewport 模擬取代；自動化與人工結果分開保存。

## Dependencies and Blockers

- 前置 01～11 已 accepted，已解除11阻塞。
- 唯一外部驗收阻塞：原 Scope 明訂的桌機／手機人工完整跨局及實體手機單手操作尚無結果。依根 AGENTS「無法取得驗收證據的部分才暫停」及本票「未執行的檢查不得記為通過」保存 blocked；自動化與文件整理繼續完成。
- 解除方式：按 [人工步驟](../docs/verification/ticket12/README.md) 回填兩種裝置／瀏覽器與逐項實際結果，修復如有缺陷後再接受；D1 仍以前置12為阻塞，部署需另行授權。

## Evidence

- Verification：工程 Gate 與完整命令／log 見 [gates/results.json](../docs/verification/ticket12/gates/results.json)；[驗收矩陣與人工步驟](../docs/verification/ticket12/README.md) 區分已測、沿用與未測。最終全量 E2E 114/114（desktop／375px，0 failed／skipped，1.0m，exit 0）；新增整合 target 2/2。當次 lint與typecheck exit 0；unit 沿用同一產品／unit工程的13files／173passed最終紀錄（舊raw log無shell exitcode，未偽造）；build為最終E2E webServer 實際執行 npm run build，75modules，成功，不冒稱另跑獨立build。
- 前置核對：01～11 Acceptance 均已勾選並有獨立審查／最終 Gate；02 的 completed 與08～11 的 done 已統一為 accepted，保留原核准與歷史證據。11 的歷史依賴已解除。
- Scope／基準：開始時 HEAD `ffe6cb3f271488b07785223c657314803cad2d3e`、分支 work、工作樹乾淨；此次只補整合測試、驗收文件與狀態，未修改產品、依賴、lockfile或雲端設定。
- Delegation：`g6-luna-low-qa-runner`（spawn 明確指定 gpt-6-luna／low）負責五命令與 log；`g6-luna-med-engineer`（同模型／medium）負責已載入頁面斷網完整跨局驗收。無 name 參數，委派與報告採固定角色名，不由 nickname 推測模型。
- Skills：`matt-skills-curated:implement`、`matt-skills-curated:code-review`，按 docs/agents/skill-workflows.md 採單一獨立 reviewer 分開檢查 Standards／Spec；沿用 cloud-environment-onboarding:setup／cloud-environment:cloud-environment-runtime 既有環境，不需要新增設定。
- Review / Audit：獨立 `g6-luna-med-reviewer`（spawn 明確指定 gpt-6-luna／medium，未參與施工）完成全量與增量 Standards／Spec 檢查。建置來源文案P2與T24子項追溯P3已修正，原reviewer確認解除；無剩餘技術交付finding，人工驗收仍blocked。檢查 staged（當時空）、unstaged及全部相關未追蹤新檔，不以HEAD分支差異取代工作樹；base／審查HEAD為開始基準。最終已審查23檔path→SHA256 sorted compact JSON指紋 `ed846cfc87ea29b9b91a48c6bcec3ef8a8b34305236bdccdf4ad9fe801b64ba8`，不含Main後續純Ticket／handoff結果追加。主Agent核對staging與快照一致後提交。
- 主 Agent 核對：01～11 狀態及 Acceptance 無未勾選；README／UIUX／驗收矩陣本機連結有效；已目視375px離線分布及UNSYNCED截圖，狀態/庫存runtime JSON一致；產品src與依賴相對基準無差異。`git diff --check` 通過。
- 未測：桌機／實體手機人工完整跨局、單手可達性、OS 檔案對話框、螢幕閱讀器、跨平台瀏覽器與真實遊戲待確認規則。雲端 Auth／RLS／備份／衝突、部署不在本票。
- Commit / PR：自動化驗收、證據與blocked接續提交 `0b2966bddc235ed2fb4202d6f3f041b7327b230b` 已依README standing authority推送 origin/work；以明確work refspec fetch後，本機HEAD與origin/work一致，遠端包含handoff。此回執另以文件提交保存；無PR／merge／deploy，人工驗收未完成。

- Metadata補查：114項全量run綁定原spec SHA256 `abf2d2d7802078dc219517158d8abd8e6ac739b620241107357bf7943ba36f0e`；review後只修coverage文字，交付SHA256 `350a8ea4e605ec873ff8545ae8c57bc173caed1779f8bb31204dc82cfc35976e`。兩份journey只改coverage，states與截圖不變；results.json另保存修正來源，不把新hash冒稱原執行版本。獨立review確認metadata-only，不需重跑suite。

- Staged whitespace核對：除原樣保存的Vitest `gates/unit.log`末尾既有空行外，其餘待提交內容 `git diff --cached --check` 通過；原始log不重排，保持驗證SHA256。
