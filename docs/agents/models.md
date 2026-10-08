# OpenAI 模型設定

只在設定或核對模型時讀取。角色與分級對應以 [README 角色與模型](../../README.md#角色與模型)為正本；本文件只保存主 Agent 的模型選用細節與官方來源。

## GPT-6.1 Sol（主 Agent）

官方來源核對日期：2026-10-02。主 Agent 可在目前 Codex Session 選用 GPT-6.1 Sol；需要明確設定時，以下為主 Agent 的專案目標設定，供環境可用時選用：

```toml
model = "gpt-6.1-sol"
model_reasoning_effort = "medium"
```

GPT-6.1 Sol 支援 `low`、`medium`、`high`、`xhigh`、`max`；官方模型預設為 `medium`，不支援 `none`／`minimal`。目前用戶端可能有不同預設或更多選項，須確認實際可用設定；本範例不自動切換模型或降低已選用的推理設定。[官方模型說明](https://developers.openai.com/api/docs/models/gpt-6.1-sol)

沿用目前有效的推理設定；需要起點時一般工作採 `medium`，複雜資料流／回歸／安全 review 可比較 `high`，更高等級只在代表性任務證據顯示有必要時使用。較高推理設定可能增加時間及 token。[官方 Subagent 與推理設定指引](https://learn.chatgpt.com/docs/agent-configuration/subagents)

## GPT-6 Astra 與其他 OpenAI 模型

官方 GPT-6 指南的提示建議主要描述 Astra 行為，可作家族方法起點，仍須用選定模型與實際工作評估。[官方 GPT-6 指南](https://developers.openai.com/api/docs/guides/latest-model)

## 證據邊界

模型名稱、設定檔與請求被接受只代表選用／路由證據；README 所列 `g61-sol-med-orchestrator` 是專案政策目標，不代表目前 Session 已切換。未取得 runtime 遙測時，不推論後端實際執行模型；本規範不代表已完成任何模型的速度、成本或品質實測。
