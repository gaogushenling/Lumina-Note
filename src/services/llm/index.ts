/**
 * LLM Service 统一入口
 */

// 类型导出
export type {
  Message,
  LLMConfig,
  LLMOptions,
  LLMResponse,
  LLMUsage,
  LLMProvider,
  LLMProviderType,
  ProviderMeta,
  ModelMeta,
  StreamChunk,
  LLMStream,
  IntentType,
  Intent,
} from "./types";

// Provider 注册表
export { PROVIDER_REGISTRY } from "./types";

// 配置管理
export { getLLMConfig, setLLMConfig, resetLLMConfig } from "./config";

// Providers
export { 
  AnthropicProvider, 
  OpenAIProvider,
  GeminiProvider,
  MoonshotProvider,
  DeepSeekProvider,
  GroqProvider,
  OpenRouterProvider,
  OllamaProvider,
} from "./providers";

// ============ 统一调用接口 ============

import type { Message, LLMOptions, LLMResponse, LLMProvider, LLMStream, LLMConfig } from "./types";
import { getLLMConfig } from "./config";
import { createProvider } from "./factory";

// 导出 Router
export { IntentRouter, intentRouter } from "./router";
export { createProvider } from "./factory";

/**
 * 调用 LLM (统一入口)
 */
export async function callLLM(
  messages: Message[],
  options?: LLMOptions,
  configOverride?: Partial<LLMConfig>
): Promise<LLMResponse> {
  console.log('[AI Debug] callLLM() called with', messages.length, 'messages');
  
  try {
    const provider = createProvider(configOverride);
    const config = getLLMConfig();
    const finalOptions = {
      ...options,
      temperature: options?.temperature ?? config.temperature,
    };
    console.log('[AI Debug] Provider created, calling provider.call()');
    const response = await provider.call(messages, finalOptions);
    console.log('[AI Debug] Provider.call() returned successfully');
    return response;
  } catch (error) {
    console.error('[AI Debug] Error in callLLM():', error);
    throw error;
  }
}

/**
 * 流式调用 LLM (统一入口)
 * 返回 AsyncGenerator，逐块 yield 内容
 */
export async function* callLLMStream(
  messages: Message[],
  options?: LLMOptions,
  configOverride?: Partial<LLMConfig>
): LLMStream {
  const provider = createProvider(configOverride);
  const config = getLLMConfig();
  const finalOptions = {
    ...options,
    temperature: options?.temperature ?? config.temperature,
  };
  
  // 检查 Provider 是否支持流式
  if (!provider.stream) {
    // 降级：不支持流式的 Provider 一次性返回
    const response = await provider.call(messages, finalOptions);
    yield { type: "text", text: response.content };
    if (response.usage) {
      yield {
        type: "usage",
        inputTokens: response.usage.promptTokens,
        outputTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      };
    }
    return;
  }
  
  // 使用 Provider 的流式方法
  yield* provider.stream(messages, finalOptions);
}
