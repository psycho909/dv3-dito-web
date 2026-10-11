# S1 獨立稽核與驗收

Authority：S1 Ticket。Owner 2026-10-11 要求依序開發，明確允許直接對正式 Supabase 施工。Base／施工前 HEAD `685421c5d5f3a18a2dafa6cfd4d4e55ae02f9081`，分支 `codex/s1-supabase-schema-rls`；舊 Auth 分支完整保留。

Independent Auditor：未參與施工的 `/root/s1_security_audit`。spawn_agent 明確請求 `gpt-6-luna`／`max`、fork_turns=none；此為派工入口證據，子 Agent 無獨立 runtime metadata。完整閱讀新增 migration、pgTAP、config、concurrency；增量核對 README／API／Ticket。

## Standards／Spec

最終 PASS，無 blocker。RLS、grants、UID、空 search_path、EXECUTE、UID 交易鎖、冪等、版本衝突、刪除墓碑／明確 revive 均核對。第一輪 event envelope finding 已修正 UUID／UTC 時間／payload 存在及測試；逐類 payload schema 經 FR10 與 payload:unknown 邊界核對後撤回，S2 仍須依 codec/reducer 驗證並保存完整事件內容。第二輪文件授權／驗證入口／索引 findings 已修正，Auditor 最終增量確認通過。

## 主 Agent runtime 證據

- CLI 2.120.0、Docker29.6.1、本機 PostgreSQL17.11.0.004；已核對官方17.11 breaking changes，本票不使用受影響的 ltree、legacy pgcrypto、btree_gist、自訂 operator。
- `npx --yes supabase@2.120.0 db reset --local --no-seed` PASS；`npx --yes supabase@2.120.0 test db` 50 assertions PASS，fixture rollback。
- `./supabase/tests/concurrency.ps1` PASS：兩連線首次競爭，一筆成功、一筆 VERSION_CONFLICT，revision／log 均只1；fixture清除。
- 本機 HTTP PostgREST authenticated 兩表 POST／PATCH／DELETE 共六條直接改寫均403，anon GET401。空 PATCH no-op204、無 WHERE PATCH400 是平台行為，非改寫成功；終版以實際欄位與UID filter驗證。只使用localhost／本機簽署JWT，未建正式測試資料。
- `npm run lint`、`git diff --check` PASS。無 app 程式變更，未重跑 app unit／build／e2e。

## 正式套用

`apply_migration(forge_cloud_state, lcsyotvievikernvhquj)` 成功，version `20261011153830`；本機 migration 檔名與 ledger 對齊該版本，SQL內容不變。唯讀核對兩表 RLS=true、自身 SELECT policies、anon SELECT/EXECUTE=false、authenticated SELECT/EXECUTE=true、直接DML=false、兩函式 search_path空；兩表row count均0。

Security Advisor 無ERROR；兩個 [authenticated SECURITY DEFINER提醒](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) 是規格需要的受控寫入入口，已有UID／grants／固定search_path／validation／測試。另有 [密碼外洩防護未啟用](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)；目前GitHub OAuth，不新增密碼登入或改方案。Performance僅 [新索引尚未使用INFO](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)，零資料時保留規格索引。

Final Review：依Owner本Session施工／正式套用授權、獨立Audit及runtime證據接受S1。未PR／merge／部署網站；前端同步S2起。

SHA256快照：migration `687432F7AE290CAC0135CEF3E425B99FDAEDA64A910DFB3985058E7D4C7EC93C`；pgTAP `8F8C264DB12C411C6915E3521131B4C7FF75651CF56AC855D6F3CBB6006FFB06`；並行腳本 `B32E75C83848068EBBF31965103F3424093919AB3885FAB0E2DDC6F199CD114A`。
