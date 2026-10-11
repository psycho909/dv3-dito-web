# S1 Supabase 資料表、RLS、RPC 與 pgTAP

- Status: accepted
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 2026-10-11 Owner 要求依序繼續開發，並明確授權「小專案不用進行隔離，可以直接碰正式Supabase」；按本票安全設計施工並套用正式專案。
- Risk: L3
- Updated: 2026-10-11
- Branch: codex/s1-supabase-schema-rls
- Git / Remote authority: 依 README commit／push 工作分支；Owner 2026-10-11 明確允許直接對正式 Supabase 施工，本票 migration 可套用 lcsyotvievikernvhquj。後續 Owner 2026-10-12 條件式授權已滿足，整合發布權限與結果見 D2。

## Goal

建立只允許使用者讀寫自己紀錄的雲端資料層，並以資料庫測試證明權限、冪等與版本衝突防護。

## Scope

- FR-10：`forge_states`、`forge_mutations`、索引、RLS、grants（revoke PUBLIC／anon）、`commit_forge_state`、`delete_forge_data`（SECURITY DEFINER、固定 search_path、驗證 `auth.uid()`、大小上限、`ForgeActionType` 驗證）。
- `supabase/tests/` pgTAP：AC-10、T27、RPC 冪等與 `VERSION_CONFLICT`。

## Out of Scope

- 前端整合（S2 起）。

## Acceptance

- [x] `supabase test db` 通過：A 不能讀寫 B、未登入者全部拒絕、直接 PostgREST 改寫被拒。
- [x] 同 mutationId 重送不重複；同 ID 不同內容被拒；舊 revision 回 `VERSION_CONFLICT`。

## Constraints and Decisions

- 匿名帳號不清理（Owner 決定）。
- `service_role` 與資料庫密碼不得進入版控或前端。

## Dependencies and Blockers

- 05已完成（`PersistedSession` 定型）。
- Owner已指定正式Supabase專案 `dv3-dito-web`（ref：`lcsyotvievikernvhquj`，Tokyo／ap-northeast-1，psycho909's Org），2026-10-11 API核對為ACTIVE_HEALTHY。
- Owner 不要求另建隔離雲端專案；本機 Docker 完成可重現驗證，正式 migration 已依本次授權及獨立 Audit 完成。下方接入準備為歷史紀錄。

## Evidence

- Verification: 2026-10-11 本機 reset、pgTAP50項、並行首次競爭、兩表PostgREST直接DML403／anon read401、lint與diff check PASS；正式migration20261011153830成功、權限唯讀核對通過、兩表仍零資料。
- Review / Audit: 獨立 context 最終 Standards／Spec PASS，主Agent依本Session Owner施工／正式套用授權及實測接受。[S1 稽核證據](../reports/audit/20261011-S1-supabase-schema-rls.md)。
- Commit / PR: 8a2246a 已 commit／push；後續依 D2 授權納入 PR #2，合併並發布 Production。

## 2026-10-11 接入準備

- Owner要求「準備開始接入Supabase」，並確認測試專案尚未建立、使用psycho909's Org（kvmbbhbefiwljyzubssu）。本輪授權與成果限preflight及建立表單草稿；不把準備要求當成遠端migration／L3最終核准。
- 已核對connector專案列表，沒有dito測試專案；未查詢或改動其他專案資料。Dashboard已由Owner自行登入，選定組織顯示Free；get_cost工具實際UNAVAILABLE，沒有假定額度或建立費用保證。
- 建立草稿：dv3-dito-web-test、Tokyo ap-northeast-1、Enable Data API、關閉Automatically expose new tables、預設Postgres、無GitHub integration。未輸入密碼／未提交建立；Owner自行設定密碼並建立，遇付費／額度提示先停。
- S1第一個施工範圍仍為兩表、只讀自身RLS、禁止直接寫入、commit/delete RPC、同UID序列化、相同mutation重送冪等／不同內容拒絕、revision衝突／刪除墓碑與pgTAP正反向測試；不先接前端S2。既有session codec為src/services/persistence.ts，schemaVersion 1及修正紀錄須保持相容，不把LocalEnvelope直接上雲。
- 官方查證：已讀supabase:supabase Skill、changelog及官方RLS／revoke EXECUTE文件；RLS使用authenticated加auth.uid()持有者條件，RPC須固定search_path並撤销PUBLIC／anon EXECUTE。來源：https://supabase.com/docs/guides/database/postgres/row-level-security 、https://supabase.com/docs/guides/troubleshooting/how-can-i-revoke-execution-of-a-postgresql-function-2GYb0A 。SECURITY DEFINER暴露schema的設計需於S1施工前依API安全指引核對，不自行新增權限。
- 環境：Docker CLI存在，但docker info無法連到dockerDesktopLinuxEngine；Supabase CLI／psql不在PATH。本輪未安裝、啟動或執行migration，沒有pgTAP PASS。
- 當時下一步：Owner完成測試專案建立並提供project ref；再固定S1安全設計／施工與遠端測試授權，準備本機CLI／Docker或等價測試入口。後續正式專案決策見下段。

## 正式專案決策（2026-10-11）

- Owner明確指示「不需要建立dv3-dito-web-test直接建立正式的」。目前Dashboard的專案已存在，因此沿用 `lcsyotvievikernvhquj`，將名稱從 `dv3-dito-web-test` 改為 `dv3-dito-web`；API核對名稱與ACTIVE_HEALTHY，不重複建立專案、不變更ref或區域。
- API URL：`https://lcsyotvievikernvhquj.supabase.co`；Dashboard：https://supabase.com/dashboard/project/lcsyotvievikernvhquj 。前述測試專案草稿保留為歷史，不再是目前目標。
- 本輪僅修改專案顯示名稱與接入紀錄，未變更Auth、RLS、Schema、密鑰、方案或套用migration；指定正式目標不取代S1安全設計核准與隔離驗證。
