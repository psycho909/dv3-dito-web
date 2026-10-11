# S2 GitHub 備份獨立稽核與驗收

- Scope／Authority：S2 Ticket，Owner 2026-10-11 要求繼續並直接操作、取消 Cloudflare，明確選擇只用既有 GitHub 登入備份。匿名／Email 條文由規格第0節 Owner 決策取代；S3 archived。
- Base／施工前 HEAD：`8a2246a1ee14ab558b6550773d8564c05c83a724`，分支 `codex/s2-github-cloud-backup`（包含尚未合併的 S1）。
- Independent Auditor：未參與施工的 `/root/s2_github_backup_audit`，工具明確請求 `gpt-6-luna`／`max`／fork_turns=none；此為派工設定，沒有後端 runtime telemetry。主 Agent 負責整合及執行驗證。
- Review commands：`git diff -- <S2 paths>`、`git diff --cached`、`git diff 8a2246a...HEAD`、`git ls-files --others --exclude-standard`；完整閱讀 untracked repository／queue與repository測試／e2e檔案，含本機封套、store、兩個雲端／Auth元件及共用ConfirmDialog。施工時 staged／committed差異為空，不能代替新增檔閱讀。

## Standards／Spec

整體技術審查與解除 findings 的增量審查 PASS。原問題及修正：

1. 完成局／核對／手動重置 payload 缺少推導結果、更正 boundaryChanges不在頂層：補足欄位，T33與更正測試驗證，保存原始操作與更正緣由。
2. 確認恢復發生登入切換或本機輸入、零pending遠端read期間帳號切換，可能卡CONNECTING：epoch與UID檢查、立即可操作ERROR／DISABLED、舊request結果不覆蓋新身分；兩個race回歸通過。
3. 確認dialog關閉後失敗不能重開：確認時清preview，失敗可重新準備；共用ConfirmDialog增confirmDisabled，不造新primitive。
4. Conflict後輸入未明示僅本機：補足文案，仍保留session／queue。
5. 零pending斷線被誤標待送：early分支與catch皆依pending／最後確認時間區分；新增第13個queue測試通過。
6. API／Ticket舊Cloudflare阻塞與語系不一致：更新並經Auditor delta review解除。

主Agent另修正驗證UID與RPC之間的SDKsession切換窗口：先取得token，再getUser(token)驗證，read／RPC固定Authorization同token；已核對鎖定SDK的setHeader與fetchWithAuth不覆蓋顯式header，repository回歸驗證。

## Runtime 與邊界

- TDD：新增atomic queue persistence測試先RED（實際保存queue=[]，斷言期望pendingbatch失敗），實作後GREEN。
- 單元：最終全套189項PASS（15檔），包含13項queue與3項repository。
- 瀏覽器：桌機／375px GitHub fixture兩案例PASS，包含確認前不送出、首次上傳、離線4/7/6、pending登出阻擋、重整後同ID重試及全新context確認下載。所有Supabase project requests攔截，不建立正式測試資料。
- 全套e2e116案例首輪106PASS、10FAIL：全部定位為舊「僅本機」exact文案與新增role=status造成過廣selector。僅修正對應兩個測試檔，受影響26案例全數PASS，未修改產品行為來掩蓋失敗。既有其他案例沿用106PASS證據。
- typecheck／lint／build與git diff check結果見Ticket。檢視375px完整備份畫面，控制可見、無水平溢出，沿用既有DESIGN/tokens。
- S1 migration未變更，不重跑已通過pgTAP。沒有正式網站發布或正式雲端寫入；mock+DB單獨驗證不能宣稱Production完整flow已驗證。

## Disposition

技術範圍可交付；Owner L3最終核准與本分支PR／merge／Production發布仍待取得，不能冒認已發布。S4完整選版及S5雲端刪除仍在後續Scope；此版遇衝突安全停止，保留所有本機／待送資料。不提供PWA離線重開保證。

快照 SHA256：forgeStore `F34A8589B0F45F56E0A3CBAB668F2D78F9512EFB13B3CE995FDA8AA452D3335C`；persistence `4746068767DF5A82611CD7FC73D61AD3EB5CFD8EB2951F69DA99BDA6738D0C76`；repository `5303EEAB7F4F62FEE2FFD55404BABCD27F81695C6D615AE4F7DB11AD36931EC0`。終版內容與以上指紋一致。
