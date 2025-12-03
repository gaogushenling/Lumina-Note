import { LLMProvider, LLMConfig } from "./types";
import { getLLMConfig } from "./config";
import { 
  AnthropicProvider, 
  OpenAIProvider,
  GeminiProvider,
  MoonshotProvider,
  DeepSeekProvider,
  GroqProvider,
  OpenRouterProvider,
  OllamaProvider,
} from "./providers";

/**
 * 根据配置创建 Provider 实例
 * @param configOverride 可选的配置覆盖
 */
export function createProvider(configOverride?: Partial<LLMConfig>): LLMProvider {
  const globalConfig = getLLMConfig();
  
  // 合并配置：优先使用 override，其次是 global
  const config = {
    ...globalConfig,
    ...configOverride,
  };

  console.log('[AI Debug] createProvider() called', {
    provider: config.provider,
    model: config.model,
    hasApiKey: !!config.apiKey,
    isOverride: !!configOverride,
  });

  // Ollama 不需要 API Key
  if (!config.apiKey && config.provider !== "ollama") {
    console.error('[AI Debug] No API key found for', config.provider);
    throw new Error(`请先配置 ${config.provider} 的 API Key`);
  }

  // 处理自定义模型
  const finalConfig = {
    ...config,
    model: config.model === "custom" && config.customModelId 
      ? config.customModelId 
      : config.model,
  };

  switch (finalConfig.provider) {
    case "anthropic":
      return new AnthropicProvider(finalConfig);
    case "openai":
      return new OpenAIProvider(finalConfig);
    case "gemini":
      return new GeminiProvider(finalConfig);
    case "moonshot":
      return new MoonshotProvider(finalConfig);
    case "deepseek":
      return new DeepSeekProvider(finalConfig);
    case "groq":
      return new GroqProvider(finalConfig);
    case "openrouter":
      return new OpenRouterProvider(finalConfig);
    case "ollama":
      return new OllamaProvider(finalConfig);
    default:
      throw new Error(`不支持的 AI 提供商: ${finalConfig.provider}`);
  }
}
