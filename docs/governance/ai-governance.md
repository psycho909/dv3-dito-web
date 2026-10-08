# AI 協作開發與治理規範

本文件只負責角色、授權、Scope、風險、獨立稽核與 Acceptance。根 `AGENTS.md` 定義工程底線；`docs/development/ai-development-guide.md` 定義工程方法；`docs/SUBAGENTS.md` 定義單次委派契約。

## 1. 權威與治理原則

1. **Owner 決策：** 產品優先順序、重大架構、安全、資料、production 與例外授權由 Owner 決定。
2. **單一正本：** Git 追蹤的 `tickets/*.md` 是正式 Work Authority；外部 tracker、PR、聊天與 handoff 不得維護第二份目前狀態正本。
3. **授權施工：** Agent 只執行目前 Authority／Ticket 允許的 Scope；草案不是批准。
4. **風險分離：** 施工與 Independent Audit 在觸發稽核時由不同角色負責。
5. **證據驗收：** 狀態與 Acceptance 只建立在可重現證據上；每個角色取得完成職責所需的最小權限。

## 2. 角色

- **Owner：** 核准 Authority、重大決策、L3 風險與例外，並處理無法由既有契約消除的阻塞。
- **Governance Advisor（可選）：** 分析需求、風險與方案，起草 Authority／Ticket；不把建議視為批准，也不自行擴張 Scope。
- **Orchestrator：** 執行 preflight、拆分工作、指派單一 owner、整合修改、驗證並整理工作證據。
- **`luna_worker`／Developer：** 依 delegated Scope 實作與回報證據；不批准自身工作的重大例外或最終驗收。
- **獨立 Auditor：** 在 L3 或其他 Audit Trigger 下，以未參與該次施工的獨立 context 檢查 Scope、風險與證據。
- **Final Reviewer：** 依 Authority、Acceptance 與 Audit 證據決定 `ACCEPTED`、`RETURNED` 或 `BLOCKED`。

角色與允許模型以目前 README 為正本，不以 Session 名稱、裝置名稱或暱稱判斷身份。Independent Audit 的獨立性是「未參與施工且使用獨立 context」；同一模型可擔任不同角色，但換模型本身不構成獨立性。L3 最終授權仍由人類 Owner 負責。

## 3. Authority／Ticket 最小契約

正式工作單位至少包含：目標、Scope、禁止事項、Acceptance、風險等級、允許的 Git／Remote 操作、依賴與 blocking edges、Owner／Approver、狀態及證據位置。

Owner／Approver 沿用 README 的一次性身份設定，Ticket 的身份快照、核准來源與例外依 [Ticket Convention](../../tickets/README.md#身份繼承與核准依據)；由 Agent 記錄已存在的明確授權，不新增逐步批准關卡。身份繼承不替代 L3 的必要核准、獨立 Audit 或遠端權限。

正式流程固定使用 draft、approved、in_progress、returned、blocked、accepted 與 archived。Authority 被修改、撤銷或取代時，必須留下來源與時間；只有具備可追溯核准證據的 Scope 可以施工。

## 4. 風險與 Audit Trigger

| 等級 | 典型範圍 | 最低治理 |
| --- | --- | --- |
| L1 | 文件、局部且可逆的低風險修改 | Orchestrator 驗證；獨立 Audit 可省略 |
| L2 | 跨模組、公開契約、依賴、可逆 migration 或中度效能影響 | 明確 Ticket、review 與風險相稱驗證；Owner 或專案規則可觸發 Audit |
| L3 | Auth／Permission、安全、敏感資料、破壞性 migration、production、重大架構或不可逆操作 | Owner 明確核准、Independent Audit 與 Final Review |

未知風險先按較高一級處理，直到新證據足以重新分級。

一般 review 深度、獨立 reviewer 不可用時的 L1／L2 fallback、L3 阻塞條件與報告最低內容，統一以 [Review 規範](../agents/review.md)為正本。

## 5. 標準流程

```text
Owner Approval → Approved Authority／Ticket
  → Orchestrator Preflight
  → 直接施工或 luna_worker Work Units
  → Integration → Verification → Standards／Spec Review
  → Independent Audit（觸發時）→ Final Review（L3 另需 Owner 核准）
      ├─ RETURNED：Scope 內修正 → 相稱重驗／重查
      ├─ BLOCKED：保留證據 → 取得必要決策／環境
      └─ 驗收滿足：文件／既有 handoff 結案 → Authorized Commit／Push
          → 遠端核對 → ACCEPTED
          → PR／Merge／Deploy（各自授權且流程需要時）→ ARCHIVED（依政策）
```

Commit／push 是完成更新及 Git handoff 的必要步驟，依 README standing authorization 與 Ticket 執行，不重問既有授權。PR、merge、deploy 與其他發布各自需要專案流程及授權，不能由 commit／push 推導。需要先交 PR 才能驗收的專案，依已核准流程提交候選版本但不提前宣稱完成；受保護分支不得繞過。

`RETURNED` 在批准 Scope 內直接修正與重驗；`BLOCKED` 只阻塞受影響部分，其他獨立且已授權工作可繼續。遠端同步失敗須保留本機成果、記錄錯誤與恢復方式；不能把已準備的 accepted／done 文件當成成功交付證據。

## 6. 證據與文件成本

- 工作證據優先保存在正式 Ticket、PR 或既有 handoff；一般工作不強制另建 Work Report 或 Final Report。
- 只有觸發 Independent Audit 時才建立 Audit Report；專案法規或稽核需求可以提高保存要求。
- `.scratch/<task>/` 只保存未完成工作的最新狀態；完成後把長期資訊移回正式正本並依專案政策保存或清理。

## 7. 建議目錄

```text
project/
├── AGENTS.md
├── README.md
├── TODO.md
├── CHANGELOG.md
├── docs/
│   ├── HANDOFF.md
│   ├── SUBAGENTS.md
│   ├── governance/ai-governance.md
│   ├── development/ai-development-guide.md
│   ├── CONTEXT.md          # 有共享 Domain／架構語彙時建立
│   ├── API.md              # 有 API 契約時建立
│   ├── UI.md               # 有 UI 契約時建立
│   └── adr/                # 有重大且難逆轉的決策時建立
├── tickets/                # 固定 Work Authority 與 Ticket 格式
├── reports/audit/          # 只有觸發 Audit 時建立
├── .scratch/<task>/        # 只有未完成且需接續時建立
├── src/
├── tests/
├── scripts/                # 有驗證、migration 或 CI 腳本時建立
└── .github/                # 使用 GitHub workflow／模板時建立
```

條件式目錄不預建空資料夾；實際技術棧不需要的目錄可以省略。
