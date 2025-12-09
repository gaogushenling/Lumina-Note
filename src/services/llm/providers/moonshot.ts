/**
 * Moonshot (Kimi) Provider
 * 支持 thinking 模型的特殊处理 + 流式传输
 */

import type { LLMConfig, LLMOptions, Message } from "../types";
import { OpenAICompatibleProvider } from "./openaiCompatible";

export class MoonshotProvider extends OpenAICompatibleProvider {
  constructor(config: LLMConfig) {
    super(config, {
      defaultBaseUrl: "https://api.moonshot.cn/v1",
      supportsReasoning: true,
      reasoningField: "reasoning_content",
      isThinkingModel: (model) => model.includes("thinking"),
    });
  }

  /**
   * 覆盖构建请求体，thinking 模型需要更大的 max_tokens
   */
  protected buildRequestBody(messages: Message[], options?: LLMOptions, stream = false) {
    const body = super.buildRequestBody(messages, options, stream);
    
    // thinking 模型需要更大的 max_tokens
    if (this.config.model.includes("thinking")) {
      body.max_tokens = 16000;
    }
    
    return body;
  }
}
