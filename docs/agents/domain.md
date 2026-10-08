# Domain Documentation Convention

- 共享 Domain、架構概念與 ubiquitous language 保存於 `docs/CONTEXT.md`；有真實內容時才建立。
- 重大、難逆轉且存在真實 trade-off 的決策保存於 `docs/adr/<NNNN-short-title>.md`。
- 一般實作細節、Ticket 狀態與暫態推論不寫入 Domain 文件。
- 只有 repository 成為真正的多 package／多 domain 結構時，才以 `CONTEXT-MAP.md` 取代單一 `docs/CONTEXT.md`，並在根 `AGENTS.md` 更新指標。
