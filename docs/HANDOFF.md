# Handoff Workflow

本文件只在未完成任務需要跨 Session、裝置、分支或等待外部條件時載入。handoff 是由 Git 傳遞的最新狀態快照，不取代 `tickets/*.md`、契約或 Git history。

## 1. 觸發條件

任務尚未完成，且即將中斷、切換環境、等待外部決策或暫停驗證時，必須建立或更新 handoff。單一 Session 已完成的任務以最終 commit／push 保存，不補建 `.scratch`；該遠端 commit 即為完成狀態的 Git handoff。

需要 handoff 的任務開始前，先依 `README.md` 取得工作分支 commit／push 授權。無法取得授權或遠端不可用時，任務只能在目前環境完成；若必須中斷，狀態標記為 `blocked`。

## 2. 固定位置與格式

在 `.scratch/<YYYYMMDD-short-task-name>/handoff.md` 保存最新狀態。證據過長、不適合放入 handoff 時才增加 `evidence.md`；Requirement、Scope 與 Acceptance 以 `tickets/<ticket>.md` 為正本。

```md
# Task Handoff

## Identity
- Task:
- Authority / Ticket:
- Status: in_progress | blocked | done
- Updated:
- Source environment:
- Branch:
- Remote:
- Base commit:
- Working tree:
- Sync target: <remote>/<branch>

## Goal and Acceptance
## Completed
## Remaining
## Decisions
## Changed Files
## Verification
## Blockers
## Next Action
```

`in_progress` 或 `blocked` 的 `Next Action` 必須是下一個環境可以直接執行的一個具體動作；`done` 固定填寫 `None — task complete`。`.scratch` 不得保存 secrets、憑證、個資、未遮罩正式資料或大型產物。

## 3. 交接送出

1. 更新 handoff、必要證據與所有已核准的任務檔案。
2. 執行可完成的驗證，記錄結果、未驗證風險與唯一 `Next Action`。
3. 將上述狀態 commit 到 `Branch`，再 push 到 `Remote`。
4. Fetch 遠端並確認本機 `HEAD` 與 `<remote>/<branch>` 指向同一 commit；遠端未包含 handoff 時，交接尚未完成。
5. Push 或驗證失敗時記錄錯誤與恢復方式，並將狀態維持 `blocked`；若 push 因遠端 race 或 rejection 失敗，保留本機 commits 與 working tree，記錄完整錯誤、執行 `git fetch <remote>` 後重新判定 ahead／behind，未取得整合授權前不 reset、rebase、merge 或 force push。

遠端最新 commit 已包含 handoff，就是 push 的可重現證據；handoff 不記錄會造成自我參照的自身 commit hash。

## 4. 下一個環境接手

1. 在目前 checkout 先讀取可用的根 `AGENTS.md`、README 必要契約及相關 Ticket／handoff；用 `git rev-parse --show-toplevel`、`git remote -v`、`git branch --show-current` 核對專案、remote URL 與目標 branch。名稱或來源不符先釐清，不先切換。
2. 用 `git status --short --branch`、`git ls-files --others --exclude-standard` 及相關 `git log` 核對本機狀態。以 `git rev-parse --git-path <name>` 取得 `MERGE_HEAD`、`CHERRY_PICK_HEAD`、`rebase-merge`、`rebase-apply`、`sequencer` 的實際路徑並檢查存在性（命令回傳路徑不代表存在）。有未完成操作、detached HEAD 或未保存資料時，先依下表保留現況。
3. 執行 `git fetch <remote>` 並確認目標 `<remote>/<branch>` 存在。若本機 `<branch>` 存在，以 `git rev-list --left-right --count <branch>...<remote>/<branch>` 判斷 ahead／behind；不存在時不執行此比較，直接走新分支路徑。Fetch／ref 解析失敗時停止同步，記錄錯誤與下一步。
4. 依下表安全切換／同步。成功後核對 `HEAD` 等於明確的同步目標，且該 commit 包含目前 handoff；讀取同步後的根／scoped 規範、Ticket 與 handoff，避免沿用舊分支的指示。
5. 核對 base commit、working tree、變更檔案、驗證證據與阻塞；更新接手時間與目前環境，確認唯一 `Next Action` 後才施工。

| 本機狀態 | 接手方式 |
| --- | --- |
| 無進行中 Git 操作、工作樹乾淨，目標本機分支不存在 | `git switch --track -c <branch> <remote>/<branch>`；不 checkout 遠端 ref 形成 detached HEAD。 |
| 無進行中 Git 操作、工作樹乾淨，目標分支 ahead 為 0 | 切換目標本機 branch；behind 大於 0 才執行 `git pull --ff-only <remote> <branch>`，完全同步不需 pull。 |
| 目標分支 ahead 大於 0 或 diverged | 保留本機 commits，阻塞自動同步並記錄差異。依既有授權判定安全整合／交付方式；不以 handoff 名義自行 reset、rebase、merge 或 force push。 |
| dirty 或有未追蹤檔案 | 不自動 stash、commit 或丟棄。若授權允許且任務不依賴未同步內容，可用 `git worktree add -b <new-branch> <path> <remote>/<branch>` 隔離；保留原 checkout，明示未同步內容不在新環境，並於施工前更新 Ticket／handoff 的工作分支及同步目標。 |
| merge／rebase／cherry-pick 等操作尚未完成，或 detached HEAD | 保留操作及 HEAD，不自動 abort 或切分支；記錄阻塞，先依授權保全 commits 並完成／處理現況。 |

表內 `<...>` 皆為核對後的實際參數；新 worktree 必須是確認過的獨立路徑及未占用分支。隔離時起點 HEAD 應等於明確遠端來源 commit；若新分支尚未發布，須在後續送出流程 push 並核對新同步目標，不能提前聲稱遠端包含新工作。任何時候有本機尚未同步的任務成果，都不能宣稱接續了該任務的完整最新狀態。

## 5. 完成與清理

任務若沒有建立 handoff，完成時不補建。若已建立 handoff，依序：

1. 將狀態改為 `done`，補齊 Completed、Changed Files、Verification 與剩餘風險。
2. 將 `Remaining`、`Blockers` 與 `Next Action` 明確標示為完成或無剩餘事項。
3. 同步長期契約與正式 Work Authority，再把 done handoff 納入最終 commit／push。
4. 確認遠端分支包含該 done handoff；完成證據尚未遠端可讀時，不宣稱完成。
5. done handoff 的清理是後續獨立更新；只有長期資訊已有正本且清理結果會再次 commit／push 時才執行。

完成條件：未完成 handoff 可由下一個環境直接接手；既有 handoff 在任務完成時已以 `done` 狀態保存到遠端，且長期資訊已有正式正本。
