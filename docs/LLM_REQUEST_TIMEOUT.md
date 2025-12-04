# LLM 请求级别超时机制

## 概述

Agent 系统的超时机制已从「整个 task 超时」改为「每次 LLM 请求超时」，提供更精细的控制和更好的用户体验。

## 核心改动

### 1. 计时粒度变更

**之前：** 从 `startTask` 开始计时，直到整个任务完成（可能包含多次 LLM 调用和工具执行）

**现在：** 每次 LLM 请求单独计时，超时阈值为 2 分钟

### 2. 幂等重试

当 LLM 请求超时时，用户可以点击「中断并重试」：
- 中断当前的 LLM 请求
- 保留所有已有的消息历史
- 追加一条超时提示消息
- 从当前上下文继续执行（**幂等**：不会重复执行已完成的步骤）

### 3. 可复用的超时 Hook

创建了 `useTimeout` hook，可在任何需要超时检测的场景复用：

```typescript
import { useTimeout } from "@/hooks/useTimeout";

const { isTimeout, elapsed, reset, stop } = useTimeout(startTime, {
  threshold: 2 * 60 * 1000,  // 2 分钟
  enabled: isRunning,
  checkInterval: 5000,        // 每 5 秒检查一次
});
```

## 技术实现

### 状态管理

**AgentState 新增字段：**
```typescript
interface AgentState {
  // ...
  llmRequestStartTime?: number | null;  // 当前 LLM 请求开始时间
  llmRequestCount?: number;             // 当前 task 中的 LLM 请求次数
}
```

**StateManager 新增方法：**
- `setLLMRequestStartTime(time: number | null)` - 设置 LLM 请求开始时间
- `incrementLLMRequestCount()` - 增加 LLM 请求计数
- `resetLLMRequestCount()` - 重置计数和时间
- `getLLMRequestStartTime()` - 获取当前请求开始时间
- `getLLMRequestCount()` - 获取请求计数

### AgentLoop 改动

**callLLM 方法：**
```typescript
private async callLLM(messages: Message[], toolNames?: string[]): Promise<LLMResponse> {
  // 记录开始时间并增加计数
  this.stateManager.setLLMRequestStartTime(Date.now());
  this.stateManager.incrementLLMRequestCount();
  
  const requestCount = this.stateManager.getLLMRequestCount();
  console.log(`[Agent] LLM 请求 #${requestCount} 开始`);
  
  try {
    const response = await callLLM(/* ... */);
    console.log(`[Agent] LLM 请求 #${requestCount} 完成`);
    
    // 清除开始时间（保留计数）
    this.stateManager.setLLMRequestStartTime(null);
    return response;
  } catch (error) {
    this.stateManager.setLLMRequestStartTime(null);
    throw error;
  }
}
```

**新增 addTimeoutHint 方法：**
```typescript
addTimeoutHint(hint: string): void {
  this.stateManager.addMessage({
    role: "user",
    content: hint,
  });
}
```

### Store 改动

**retryTimeout 方法（超时重试）：**
```typescript
retryTimeout: async (context) => {
  const loop = getAgentLoop();
  const { llmRequestCount } = get();
  
  // 1. 中断当前请求
  loop.abort();
  
  console.log(`[Agent] 重试第 ${llmRequestCount + 1} 次 LLM 请求（超时）`);
  
  // 2. 追加超时提示
  const timeoutMessage = `⚠️ 上一次 LLM 请求响应超时（第 ${llmRequestCount + 1} 次请求），正在重新请求，请继续处理当前任务。`;
  loop.addTimeoutHint(timeoutMessage);
  
  // 3. 重置超时状态，继续执行（从当前消息状态继续，保证幂等）
  set({ 
    status: "running",
    pendingTool: null,
    llmRequestStartTime: null,
  });
  
  await loop.continueLoop(context);
  get()._updateFromLoop();
}
```

### UI 改动

**AgentMessageRenderer：**
- 使用 `useTimeout` hook 替代手写的 `useEffect` 计时逻辑
- 接收 `llmRequestStartTime` 而非 `taskStartTime`
- 提示文案改为「当前 LLM 请求响应时间过长」

**AgentPanel & MainAIChatShell：**
- 从 store 获取 `llmRequestStartTime`
- 传递给 `AgentMessageRenderer`

## 使用场景

### 1. 长时间的 LLM 响应

当某次 LLM 调用因网络问题、模型负载等原因超过 2 分钟：
- UI 显示超时提示
- 用户点击「中断并重试」
- 系统中断当前请求，从相同位置重新开始

### 2. 工具执行中的 LLM 超时

即使在执行工具的过程中，如果 LLM 本身超时：
- 不影响已完成的工具执行结果
- 重试时保留所有工具执行历史
- 仅重新请求 LLM 响应

### 3. 多次重试

每次重试都是幂等的：
- 保留完整的消息历史
- LLM 可以看到之前的所有上下文
- 不会重复执行已完成的操作

## 优势

1. **更精准的超时检测** - 只针对 LLM 请求本身，不受工具执行时间影响
2. **更好的用户体验** - 用户可以手动干预，而非被动等待
3. **幂等性保证** - 重试不会产生副作用
4. **代码复用** - `useTimeout` hook 可用于其他需要超时的场景
5. **可观测性** - 通过请求计数可以追踪每次调用

## 未来扩展

可以基于 `useTimeout` hook 实现：
- 工具执行超时检测
- 文件操作超时
- 其他异步操作的超时控制

只需传入不同的 `startTime` 和 `threshold` 即可。
