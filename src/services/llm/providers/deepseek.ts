/**
 * DeepSeek Provider
 * 支持 DeepSeek R1 的 reasoning_content + 流式传输
 */

import type { Message, LLMConfig, LLMOptions, LLMResponse, LLMProvider, LLMStream } from "../types";

export class DeepSeekProvider implements LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async call(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl || "https://api.deepseek.com/v1";
    const isReasonerModel = this.config.model.includes("reasoner");

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: isReasonerModel ? 1.0 : (options?.temperature ?? 0.7),
        max_tokens: options?.maxTokens || 8192,
        stream: false,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek API 错误: ${errorText}`);
    }

    const data = await response.json();
    const message = data.choices[0]?.message;

    let content = "";
    if (message) {
      if (message.reasoning_content) {
        content += `<thinking>\n${message.reasoning_content}\n</thinking>\n\n`;
      }
      content += message.content || "";
    }

    return {
      content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          }
        : undefined,
    };
  }

  /**
   * 流式调用 DeepSeek API
   */
  async *stream(messages: Message[], options?: LLMOptions): LLMStream {
    const baseUrl = this.config.baseUrl || "https://api.deepseek.com/v1";
    const isReasonerModel = this.config.model.includes("reasoner");

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: isReasonerModel ? 1.0 : (options?.temperature ?? 0.7),
        max_tokens: options?.maxTokens || 8192,
        stream: true,  // 启用流式
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      yield { type: "error", error: `DeepSeek API 错误: ${errorText}` };
      return;
    }

    if (!response.body) {
      yield { type: "error", error: "Response body is null" };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          
          if (data === "[DONE]") {
            return;
          }

          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta;

            // 处理 reasoning_content (DeepSeek R1 思考过程)
            if (delta?.reasoning_content) {
              yield { type: "reasoning", text: delta.reasoning_content };
            }

            // 处理正常文本内容
            if (delta?.content) {
              yield { type: "text", text: delta.content };
            }

            // 处理 usage (通常在最后一个 chunk)
            if (json.usage) {
              yield {
                type: "usage",
                inputTokens: json.usage.prompt_tokens || 0,
                outputTokens: json.usage.completion_tokens || 0,
                totalTokens: json.usage.total_tokens || 0,
              };
            }
          } catch {
            // JSON 解析失败，跳过
          }
        }
      }
    } catch (e) {
      yield { type: "error", error: String(e) };
    } finally {
      reader.releaseLock();
    }
  }
}
