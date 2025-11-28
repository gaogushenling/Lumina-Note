我来搜索 Roo-Code 中流式传输的实现。

让我查看核心的流式传输实现文件：

让我查看更多关键文件：

让我查看 Task.ts 中处理流的完整实现：

# Roo-Code 流式传输实现分析

## 核心架构

### 1. 统一流类型定义
```@D:\Desktop\Lumina Note\Roo-Code\src\api\transform\stream.ts#1:14
export type ApiStream = AsyncGenerator<ApiStreamChunk>

export type ApiStreamChunk =
	| ApiStreamTextChunk
	| ApiStreamUsageChunk
	| ApiStreamReasoningChunk
	| ApiStreamGroundingChunk
	| ApiStreamToolCallChunk
	| ApiStreamToolCallStartChunk
	| ApiStreamToolCallDeltaChunk
	| ApiStreamToolCallEndChunk
	| ApiStreamToolCallPartialChunk
	| ApiStreamError
```

**核心设计**: 使用 `AsyncGenerator` 作为统一的流式接口，所有 Provider 返回相同类型的 [ApiStream](cci:2://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/api/transform/stream.ts:0:0-0:54)。

### 2. Provider 实现模式

#### Anthropic Provider (SDK Stream)
```@D:\Desktop\Lumina Note\Roo-Code\src\api\providers\anthropic.ts#42:46
async *createMessage(
    systemPrompt: string,
    messages: Anthropic.Messages.MessageParam[],
    metadata?: ApiHandlerCreateMessageMetadata,
): ApiStream {
```

**关键实现**:
- 使用 Anthropic SDK 的 `stream: true` 参数
- 通过 `for await (const chunk of stream)` 迭代 SDK 返回的流
- 根据 `chunk.type` 分发不同事件（`message_start`, `content_block_delta`, `text_delta` 等）
- 使用 `yield` 发送标准化的 [ApiStreamChunk](cci:2://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/api/transform/stream.ts:2:0-12:17)

```@D:\Desktop\Lumina Note\Roo-Code\src\api\providers\anthropic.ts#186:265
for await (const chunk of stream) {
    switch (chunk.type) {
        case "message_start": {
            // ...
            yield {
                type: "usage",
                inputTokens: input_tokens,
                outputTokens: output_tokens,
                // ...
            }
            break
        }
        case "content_block_delta":
            switch (chunk.delta.type) {
                case "text_delta":
                    yield { type: "text", text: chunk.delta.text }
                    break
                // ...
            }
            break
    }
}
```

#### OpenAI Provider (Chat Completions Stream)
```@D:\Desktop\Lumina Note\Roo-Code\src\api\providers\openai.ts#196:229
let lastUsage

for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta ?? {}

    if (delta.content) {
        for (const chunk of matcher.update(delta.content)) {
            yield chunk
        }
    }

    if ("reasoning_content" in delta && delta.reasoning_content) {
        yield {
            type: "reasoning",
            text: (delta.reasoning_content as string | undefined) || "",
        }
    }

    if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
            yield {
                type: "tool_call_partial",
                index: toolCall.index,
                id: toolCall.id,
                name: toolCall.function?.name,
                arguments: toolCall.function?.arguments,
            }
        }
    }

    if (chunk.usage) {
        lastUsage = chunk.usage
    }
}
```

#### OpenAI Native (Responses API + SSE Fallback)
```@D:\Desktop\Lumina Note\Roo-Code\src\api\providers\openai-native.ts#561:591
private async *handleStreamResponse(body: ReadableStream<Uint8Array>, model: OpenAiNativeModel): ApiStream {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""

            for (const line of lines) {
                if (line.startsWith("data: ")) {
                    const data = line.slice(6).trim()
                    if (data === "[DONE]") continue

                    const parsed = JSON.parse(data)
                    // Process events...
                }
            }
        }
    } finally {
        // cleanup
    }
}
```

**SSE 手动解析**: 当 SDK 不可用时，使用 `fetch` + `ReadableStream` 手动解析 Server-Sent Events。

### 3. 消费端实现 (Task.ts)

```@D:\Desktop\Lumina Note\Roo-Code\src\core\task\Task.ts#3499:3606
const stream = this.api.createMessage(
    systemPrompt,
    cleanConversationHistory as unknown as Anthropic.Messages.MessageParam[],
    metadata,
)
const iterator = stream[Symbol.asyncIterator]()

// ...error handling for first chunk...

const firstChunk = await Promise.race([firstChunkPromise, abortPromise])
yield firstChunk.value

// ...

// Yield all remaining chunks
yield* iterator
```

**消费流程**:
1. 调用 [api.createMessage()](cci:1://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/api/index.ts:101:1-105:13) 获取 `AsyncGenerator`
2. 使用 `Promise.race` 处理首个 chunk（支持超时/取消）
3. 使用 `yield*` 委托剩余的 chunks 到调用者

### 4. 取消机制

```@D:\Desktop\Lumina Note\Roo-Code\src\api\providers\openai-native.ts#325:355
private async *executeRequest(...): ApiStream {
    this.abortController = new AbortController()

    try {
        const stream = (await (this.client as any).responses.create(requestBody, {
            signal: this.abortController.signal,
        })) as AsyncIterable<any>

        for await (const event of stream) {
            if (this.abortController.signal.aborted) {
                break
            }
            // ...
        }
    } finally {
        this.abortController = undefined
    }
}
```

## 总结

| 技术点 | 实现方式 |
|--------|----------|
| **流类型** | `AsyncGenerator<ApiStreamChunk>` |
| **SDK 流** | `for await (const chunk of sdkStream) { yield ... }` |
| **SSE 流** | `fetch` + `ReadableStream.getReader()` + 手动解析 `data:` 行 |
| **事件标准化** | 所有 Provider 将各自格式转换为统一的 [ApiStreamChunk](cci:2://file:///D:/Desktop/Lumina%20Note/Roo-Code/src/api/transform/stream.ts:2:0-12:17) 类型 |
| **取消支持** | `AbortController` + `signal` |
| **错误处理** | 首 chunk 特殊处理，支持重试逻辑 |

这套架构的优点是：
- **统一接口**：不论底层是 Anthropic、OpenAI 还是其他 Provider，上层消费代码完全一致
- **类型安全**：通过 discriminated union (`type` 字段) 实现类型安全的事件处理
- **灵活性**：支持 SDK 原生流和手动 SSE 解析两种模式