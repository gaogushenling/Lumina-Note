/**
 * Agent 主循环
 * 
 * 负责：
 * 1. 管理 Agent 生命周期
 * 2. 协调 LLM 调用和工具执行
 * 3. 处理用户审批流程
 */

import { 
  Message, 
  TaskContext, 
  ToolCall, 
  ToolResult,
  AgentEventHandler,
  AgentEventType,
  LLMResponse,
  RAGSearchResult,
  LLMConfig
} from "../types";
import { StateManager } from "./StateManager";
import { parseResponse, formatToolResult, getNoToolUsedPrompt } from "./MessageParser";
import { PromptBuilder } from "../prompts/PromptBuilder";
import { ToolRegistry } from "../tools/ToolRegistry";
import { callLLM } from "../providers";
import { useRAGStore } from "@/stores/useRAGStore";

const MAX_CONSECUTIVE_ERRORS = 3;

export class AgentLoop {
  private stateManager: StateManager;
  private promptBuilder: PromptBuilder;
  private toolRegistry: ToolRegistry;
  private abortController: AbortController | null = null;
  private approvalResolver: ((approved: boolean) => void) | null = null;

  constructor() {
    this.stateManager = new StateManager();
    this.promptBuilder = new PromptBuilder();
    this.toolRegistry = new ToolRegistry();
  }

  // ============ 公共 API ============

  /**
   * 设置消息历史（用于恢复会话）
   */
  setMessages(messages: Message[]): void {
    this.stateManager.setMessages(messages);
  }

  /**
   * 启动 Agent 任务
   */
  async startTask(userMessage: string, context: TaskContext, configOverride?: Partial<LLMConfig>): Promise<void> {
    // 保存现有消息（不重置）
    const existingMessages = this.stateManager.getMessages();
    const hasHistory = existingMessages.length > 1; // 除了 system 消息外还有其他消息
    
    // 重置状态但保留消息历史
    this.stateManager.setStatus("running");
    this.stateManager.setTask(userMessage);
    this.stateManager.resetErrors();
    this.stateManager.setLLMConfig(configOverride);
    this.abortController = new AbortController();

    // RAG 自动注入：搜索相关笔记
    const enrichedContext = await this.enrichContextWithRAG(userMessage, context);

    // 构建消息
    const systemPrompt = this.promptBuilder.build(enrichedContext);
    const userContent = this.buildUserContent(userMessage, enrichedContext);

    if (hasHistory) {
      // 保留历史，更新 system prompt，添加新用户消息
      const newMessages = existingMessages.map((msg, i) => 
        i === 0 && msg.role === "system" 
          ? { role: "system" as const, content: systemPrompt }
          : msg
      );
      newMessages.push({ role: "user", content: userContent });
      this.stateManager.setMessages(newMessages);
    } else {
      // 首次任务，初始化消息
      this.stateManager.setMessages([
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ]);
    }

    // 进入主循环
    try {
      await this.runLoop(context);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        this.stateManager.setStatus("aborted");
      } else {
        this.stateManager.setStatus("error");
        this.stateManager.setError(error instanceof Error ? error.message : "未知错误");
      }
    }
  }

  /**
   * 中止当前任务
   */
  abort(): void {
    this.abortController?.abort();
    this.stateManager.setStatus("aborted");
    
    // 如果正在等待审批，拒绝
    if (this.approvalResolver) {
      this.approvalResolver(false);
      this.approvalResolver = null;
    }
  }

  /**
   * 审批工具调用
   */
  approveToolCall(approved: boolean): void {
    if (this.approvalResolver) {
      this.approvalResolver(approved);
      this.approvalResolver = null;
    }
  }

  /**
   * 获取当前状态
   */
  getState() {
    return this.stateManager.getState();
  }

  /**
   * 事件监听
   */
  on(event: AgentEventType, handler: AgentEventHandler): () => void {
    return this.stateManager.on(event, handler);
  }

  // ============ 私有方法 ============

  /**
   * Agent 主循环
   */
  private async runLoop(context: TaskContext): Promise<void> {
    while (
      this.stateManager.getStatus() === "running" && 
      !this.abortController?.signal.aborted
    ) {
      try {
        // 1. 调用 LLM
        const messages = this.stateManager.getMessages();
        const response = await this.callLLM(messages);

        // 2. 解析响应
        const parsedResponse = parseResponse(response.content);

        // 3. 添加 assistant 消息
        this.stateManager.addMessage({
          role: "assistant",
          content: response.content,
        });

        // 4. 处理工具调用
        if (parsedResponse.toolCalls.length > 0) {
          // 检查是否包含 attempt_completion
          const hasCompletion = parsedResponse.toolCalls.some(
            (tc) => tc.name === "attempt_completion"
          );

          await this.handleToolCalls(parsedResponse.toolCalls, context);

          // 如果调用了 attempt_completion，任务完成，退出循环
          if (hasCompletion || parsedResponse.isCompletion) {
            this.stateManager.setStatus("completed");
            break;
          }
        } else if (parsedResponse.isCompletion) {
          // 任务完成（无工具调用但有完成标记）
          this.stateManager.setStatus("completed");
          break;
        } else {
          // 没有工具调用也没有完成标记

          // 检查是否是纯文本回复（可能是闲聊）
          // 移除 thinking 标签后，如果剩余内容不包含类似工具调用的标签，则视为普通回复
          const cleanContent = response.content.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();
          
          // 移除代码块，避免误判代码中的标签
          const contentWithoutCode = cleanContent.replace(/```[\s\S]*?```/g, "");
          
          // 检查是否有潜在的工具标签（简单的启发式：包含下划线的标签通常是工具，如 <read_note>）
          // 如果 parseResponse 没解析出来，但这里匹配到了，说明可能是格式错误的工具调用
          const hasPotentialToolTag = /<[a-z]+(_[a-z]+)+/i.test(contentWithoutCode);

          // 只有在非严格模式下（如 chat/writer/researcher），或者看起来像是提问时，才允许纯文本结束
          // 对于 editor/organizer，我们期望它至少调用 ask_user 或 attempt_completion
          const currentMode = context.mode?.slug;
          const intent = context.intent;
          
          // 如果意图明确是 chat，则允许纯文本回复
          if (intent === "chat") {
            this.stateManager.setStatus("completed");
            break;
          }

          // 否则，如果是操作模式，则强制要求使用工具
          const isActionOrientedMode = currentMode === "editor" || currentMode === "organizer";
          // 检查是否是明确的操作意图 (create/edit/organize)
          const isExplicitActionIntent = intent === "create" || intent === "edit" || intent === "organize";

          if (!hasPotentialToolTag && cleanContent.length > 0) {
            if (isActionOrientedMode || isExplicitActionIntent) {
              // 在操作模式或操作意图下，如果回复很短（可能是简单的确认或拒绝），或者包含问号（可能是提问），则允许通过
              // 否则，强制要求使用工具，防止 Agent 幻觉（说做了但没做）
              const isShortReply = cleanContent.length < 50;
              const isQuestion = cleanContent.includes("?") || cleanContent.includes("？");
              
              // 只有当意图不是明确的操作意图时，才允许简短回复通过
              // 如果意图明确是 create/edit/organize，即使回复很短，也必须使用工具（除非是提问）
              
              if ((isShortReply || isQuestion) && (!isExplicitActionIntent || isQuestion)) {
                this.stateManager.setStatus("completed");
                break;
              }
              // 否则，继续执行下面的错误处理，强制要求使用工具
            } else {
              // 非操作模式（Writer/Researcher），允许纯文本回复
              this.stateManager.setStatus("completed");
              break;
            }
          }

          this.stateManager.incrementErrors();
          
          if (this.stateManager.getConsecutiveErrors() >= MAX_CONSECUTIVE_ERRORS) {
            this.stateManager.setStatus("error");
            this.stateManager.setError("Agent 未能正确使用工具");
            break;
          }

          // 提示 LLM 使用工具
          this.stateManager.addMessage({
            role: "user",
            content: getNoToolUsedPrompt(),
          });
        }
      } catch (error) {
        this.handleError(error);
        
        if (this.stateManager.getStatus() === "error") {
          break;
        }
      }
    }
  }

  /**
   * 调用 LLM
   */
  private async callLLM(messages: Message[]): Promise<LLMResponse> {
    const configOverride = this.stateManager.getLLMConfig();
    return callLLM(messages, {
      signal: this.abortController?.signal,
    }, configOverride);
  }

  /**
   * 处理工具调用
   */
  private async handleToolCalls(toolCalls: ToolCall[], context: TaskContext): Promise<void> {
    for (const toolCall of toolCalls) {
      // 检查是否被中止
      if (this.abortController?.signal.aborted) {
        break;
      }

      // 检查是否需要用户审批
      if (this.requiresApproval(toolCall)) {
        this.stateManager.setStatus("waiting_approval");
        this.stateManager.setPendingTool(toolCall);

        // 等待用户审批
        const approved = await this.waitForApproval();
        
        if (!approved) {
          this.stateManager.addMessage({
            role: "user",
            content: `用户拒绝了工具调用: ${toolCall.name}。\n\n请使用 <thinking> 标签分析用户拒绝的原因（可能是操作危险、参数不正确或不符合用户意图），然后尝试其他方式或询问用户需求。`,
          });
          this.stateManager.setStatus("running");
          continue;
        }
      }

      // 执行工具
      const result = await this.executeTool(toolCall, context);

      // 将结果添加到消息
      let resultMsg = formatToolResult(toolCall, result);
      
      // 如果执行失败，追加反思提示
      if (!result.success) {
        resultMsg += `\n\n❌ 系统拒绝执行：检测到工具调用错误。\n\n请立即反思：\n1. 工具名称是否正确？\n2. 参数格式是否符合 JSON 规范？\n3. 参数值是否有效？(特别是文件路径是否包含特殊字符或格式错误)\n\n请在下一次回复中：\n1. 必须使用 <thinking> 标签详细分析错误原因\n2. 修正错误并重新调用工具`;
      }

      this.stateManager.addMessage({
        role: "user",
        content: resultMsg,
      });

      this.stateManager.resetErrors();
    }

    this.stateManager.setStatus("running");
    this.stateManager.setPendingTool(null);
  }

  /**
   * 判断工具是否需要用户审批
   */
  private requiresApproval(toolCall: ToolCall): boolean {
    return this.toolRegistry.requiresApproval(toolCall.name);
  }

  /**
   * 等待用户审批
   */
  private waitForApproval(): Promise<boolean> {
    return new Promise((resolve) => {
      this.approvalResolver = resolve;
    });
  }

  /**
   * 执行工具
   */
  private async executeTool(toolCall: ToolCall, context: TaskContext): Promise<ToolResult> {
    try {
      return await this.toolRegistry.execute(toolCall.name, toolCall.params, {
        workspacePath: context.workspacePath,
        activeNotePath: context.activeNote,
      });
    } catch (error) {
      return {
        success: false,
        content: "",
        error: error instanceof Error ? error.message : "工具执行失败",
      };
    }
  }

  /**
   * RAG 自动注入：搜索相关笔记并增强上下文
   */
  private async enrichContextWithRAG(userMessage: string, context: TaskContext): Promise<TaskContext> {
    // 如果消息太短（少于 5 个字符），不进行搜索
    if (userMessage.length < 5) {
      return context;
    }

    try {
      const ragStore = useRAGStore.getState();
      const ragManager = ragStore.ragManager;
      const ragConfig = ragStore.config;

      // 检查 RAG 是否启用和初始化
      if (!ragConfig.enabled || !ragManager?.isInitialized()) {
        return context;
      }

      // 执行语义搜索
      const results = await ragManager.search(userMessage, { limit: 10 });

      if (results.length === 0) {
        return context;
      }

      // 转换为 RAGSearchResult 格式，确保字段有效
      const ragResults: RAGSearchResult[] = results
        .filter(r => r.filePath && r.content) // 过滤无效结果
        .map(r => ({
          filePath: r.filePath || "未知文件",
          content: r.content || "",
          score: typeof r.score === "number" && !isNaN(r.score) ? r.score : 0,
          heading: r.heading || undefined,
        }));

      console.log(`[Agent] RAG 自动注入: 找到 ${ragResults.length} 个相关笔记`);

      return {
        ...context,
        ragResults,
      };
    } catch (error) {
      console.error("[Agent] RAG 搜索失败:", error);
      return context;
    }
  }

  /**
   * 构建用户消息内容
   */
  private buildUserContent(message: string, context: TaskContext): string {
    let content = `<task>\n${message}\n</task>`;

    // 如果有当前打开的笔记，添加其内容
    if (context.activeNote && context.activeNoteContent) {
      content += `\n\n<current_note path="${context.activeNote}">\n${context.activeNoteContent}\n</current_note>`;
    }

    // RAG 自动注入：添加 top 3 相关笔记的详细内容
    if (context.ragResults && context.ragResults.length > 0) {
      const topResults = context.ragResults.slice(0, 3);
      content += `\n\n<related_notes hint="以下是与任务相关的笔记内容，可供参考">`;
      topResults.forEach((r, i) => {
        const preview = r.content.length > 600 ? r.content.slice(0, 600) + "..." : r.content;
        content += `\n\n### ${i + 1}. ${r.filePath} (相关度: ${(r.score * 100).toFixed(0)}%)${r.heading ? ` - ${r.heading}` : ""}\n${preview}`;
      });
      content += `\n</related_notes>`;
    }

    return content;
  }

  /**
   * 处理错误
   */
  private handleError(error: unknown): void {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        this.stateManager.setStatus("aborted");
        return;
      }
      
      this.stateManager.incrementErrors();
      
      if (this.stateManager.getConsecutiveErrors() >= MAX_CONSECUTIVE_ERRORS) {
        this.stateManager.setStatus("error");
        this.stateManager.setError(error.message);
      } else {
        // 添加错误信息让 LLM 重试
        this.stateManager.addMessage({
          role: "user",
          content: `❌ 系统错误: ${error.message}。\n\n请使用 <thinking> 标签分析错误原因，并尝试修复或使用替代方案。`,
        });
      }
    }
  }
}

// 导出单例
let agentLoop: AgentLoop | null = null;

export function getAgentLoop(): AgentLoop {
  if (!agentLoop) {
    agentLoop = new AgentLoop();
  }
  return agentLoop;
}

export function resetAgentLoop(): void {
  agentLoop = null;
}
