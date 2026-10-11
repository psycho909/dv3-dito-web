# Ticket 12 自動化 Gate 證據

執行角色 `g6-luna-low-qa-runner`（spawn 指定 gpt-6-luna／low）；工具無名稱參數，採固定角色名。基準 HEAD `ffe6cb3f271488b07785223c657314803cad2d3e`，repo 根目錄 `/workspace/dv3-dito-web`。起始工作樹乾淨為 Main kickoff 觀察；Ticket 當時 approved，目前正式狀態以 [Ticket 12](../../../../tickets/20261008-12-local-v1-acceptance.md) 為準。

五項自動化 Gate 通過，精確命令、UTC時間、來源、count、退出碼與log SHA256見 [results.json](results.json)。環境沿用 README 的 npm／Playwright cache 及 fontconfig。可重現入口：

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e -- --reporter=line --workers=2
```

| Gate | 最終結果 | 證據來源與執行方式 |
| --- | --- | --- |
| lint | exit 0，errors 0 | `lint.log`，新 spec 完成後 10:42:43–10:42:45 UTC 重跑 |
| typecheck | exit 0，vue-tsc／tsc 完成 | `typecheck.log`；此後僅新增 E2E spec 與文件，tsconfig 不涵蓋 E2E，未重跑 |
| unit | 13 files／173 passed，0 failed／skipped | `unit.log`，沿用 Ticket 11 相同產品與unit版本；原始log無shell exitcode，JSON為null，不偽造退出碼 |
| build | 75 modules，3輸出檔案，Vite成功 | **`e2e.log`**，最終E2E的Playwright webServer實際執行 `npm run build`；不是重用舊build、也未額外單獨重跑build命令 |
| e2e | 114 passed，0 failed／skipped，exit 0，1.0m | **`e2e.log`**，desktop／375px mobile，含新增離線整合旅程 |

`build.log` 是保留的 Ticket 11 baseline 診斷log，**不是本次final build來源**；final build以 `results.json.commands.build.source` 指向的 `e2e.log` 為準。它與173 unit的沿用基準在前置Ticket可查；最終E2E已另建production build並啟動preview，因此不靠舊build推定本次成功。

Gate不代替人工完整跨局／實體手機單手驗收、雲端、真實遊戲規則觀察、OS檔案對話框、跨瀏覽器與螢幕閱讀器。Ticket12仍blocked，未accepted。
