# S1 Supabase 資料表、RLS、RPC 與 pgTAP

- Status: draft
- Owner: User（沿用 README）
- Approver: User（同 Owner）
- Approval evidence: 未取得（L3，需 Owner 對安全設計明確核准）
- Risk: L3
- Updated: 2026-10-11
- Branch: main
- Git / Remote authority: 依 README；migration 套用到遠端 Supabase 專案需另行授權

## Goal

建立只允許使用者讀寫自己紀錄的雲端資料層，並以資料庫測試證明權限、冪等與版本衝突防護。

## Scope

- FR-10：`forge_states`、`forge_mutations`、索引、RLS、grants（revoke PUBLIC／anon）、`commit_forge_state`、`delete_forge_data`（SECURITY DEFINER、固定 search_path、驗證 `auth.uid()`、大小上限、`ForgeActionType` 驗證）。
- `supabase/tests/` pgTAP：AC-10、T27、RPC 冪等與 `VERSION_CONFLICT`。

## Out of Scope

- 前端整合（S2 起）。

## Acceptance

- [ ] `supabase test db` 通過：A 不能讀寫 B、未登入者全部拒絕、直接 PostgREST 改寫被拒。
- [ ] 同 mutationId 重送不重複；同 ID 不同內容被拒；舊 revision 回 `VERSION_CONFLICT`。

## Constraints and Decisions

- 匿名帳號不清理（Owner 決定）。
- `service_role` 與資料庫密碼不得進入版控或前端。

## Dependencies and Blockers

- 05已完成（`PersistedSession` 定型）。
- Owner已指定正式Supabase專案 `dv3-dito-web`（ref：`lcsyotvievikernvhquj`，Tokyo／ap-northeast-1，psycho909's Org），2026-10-11 API核對為ACTIVE_HEALTHY。
- 本機需Supabase CLI與Docker完成隔離驗證；正式專案migration仍依本Ticket的L3施工／遠端授權與獨立Audit辦理。

## Evidence

- Verification:
- Review / Audit:
- Commit / PR:

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
