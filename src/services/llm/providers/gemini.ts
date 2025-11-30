/**
 * Google Gemini Provider
 * 支持 Gemini 2.5 Flash/Pro 等模型
 */

import type { Message, LLMConfig, LLMOptions, LLMResponse, LLMProvider } from "../types";

export class GeminiProvider implements LLMProvider {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  async call(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const baseUrl = this.config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
    const model = this.config.model || "gemini-2.5-flash";

    // 转换消息格式为 Gemini 格式
    const contents = this.convertMessages(messages);

    const response = await fetch(
      `${baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options?.temperature ?? 0.7,
            maxOutputTokens: options?.maxTokens || 8192,
          },
        }),
        signal: options?.signal,
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API 错误: ${error}`);
    }

    const data = await response.json();
    
    // 提取响应内容
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    
    // 提取 usage 信息
    const usage = data.usageMetadata ? {
      promptTokens: data.usageMetadata.promptTokenCount || 0,
      completionTokens: data.usageMetadata.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata.totalTokenCount || 0,
    } : undefined;

    return { content, usage };
  }

  /**
   * 将标准消息格式转换为 Gemini 格式
   */
  private convertMessages(messages: Message[]): Array<{
    role: string;
    parts: Array<{ text: string }>;
  }> {
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    
    for (const msg of messages) {
      // Gemini 只支持 "user" 和 "model" 角色
      let role: string;
      if (msg.role === "assistant") {
        role = "model";
      } else if (msg.role === "system") {
        // 系统消息作为用户消息的前缀处理
        // 或者可以使用 systemInstruction（在请求体顶层）
        role = "user";
      } else {
        role = "user";
      }

      // 合并连续的相同角色消息
      const lastContent = contents[contents.length - 1];
      if (lastContent && lastContent.role === role) {
        lastContent.parts.push({ text: msg.content });
      } else {
        contents.push({
          role,
          parts: [{ text: msg.content }],
        });
      }
    }

    // Gemini 要求第一条消息必须是 user
    if (contents.length > 0 && contents[0].role === "model") {
      contents.unshift({
        role: "user",
        parts: [{ text: "请继续" }],
      });
    }

    return contents;
  }
}
