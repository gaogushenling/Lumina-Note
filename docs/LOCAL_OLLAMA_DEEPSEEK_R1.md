# 本地 Ollama + DeepSeek R1 使用说明

适用于在本地通过 Ollama 调用 `deepseek-r1:14b`，并在 Lumina Note 内获得推理（reasoning）内容。

## 1. 前置准备
- 安装 [Ollama](https://ollama.com/) 并启动服务（默认 `http://localhost:11434`）。
- 下载模型：
  ```bash
  ollama pull deepseek-r1:14b
  ```
  > 如需更省显存，可换用量化模型（例如 `deepseek-r1:14b-q4_0`）。

## 2. 在 Lumina Note 中配置
- 设置 → AI 设置
  - Provider：`Ollama`
  - Base URL：`http://localhost:11434/v1`（默认即可）
  - Model：`deepseek-r1:14b`（或你的量化型号）
  - API Key：留空（Ollama 本地不需要）
- 应用后即可在对话/Agent 中使用本地模型。

## 3. 推理内容解析
- 项目已为 Ollama 启用推理解析：`supportsReasoning = true`，字段名采用 `reasoning`，并会兜底兼容 `reasoning_content`。
- 若模型返回推理片段，会以 `<thinking>...</thinking>` 包裹拼接到最终内容中，流式也会逐段输出。

## 4. 参数建议（可按需在设置里调整）
- `temperature`: 0.1 ~ 0.3（更偏向稳健推理）
- `top_p`: 0.1 ~ 0.4
- 系统提示：可设置成「你是逻辑推理助手，先列步骤再给结论」以获得更结构化的思考过程。

## 5. 常见问题
- **看不到推理片段？** 请确认模型确实返回了 `reasoning` 或 `reasoning_content`。若仍无，可在系统提示中要求“先给出思考过程，再给最终答案”。
- **长上下文被截断？** `num_predict` 默认 4096，如需更长可在配置中调大（显存允许的情况下）。
- **端口被占用？** 修改 Ollama 监听端口后，同步更新 Base URL。

