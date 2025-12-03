import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Message,
  FileReference,
  EditSuggestion,
  AIConfig,
  chat,
  parseFileReferences,
  parseEditSuggestions,
  applyEdit,
  setAIConfig,
  getAIConfig,
} from "@/lib/ai";
import { readFile } from "@/lib/tauri";
import { callLLM } from "@/services/llm";
import { encryptApiKey, decryptApiKey } from "@/lib/crypto";

// Pending diff for preview
export interface PendingDiff {
  fileName: string;
  filePath: string;
  original: string;
  modified: string;
  description: string;
}

// 文本片段引用 (Add to Chat)
export interface TextSelection {
  id: string;
  text: string;
  source: string;  // 来源文件名
  sourcePath?: string;  // 来源文件路径
}

// Token usage tracking
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

function generateSessionTitleFromMessages(messages: Message[], fallback: string = "新对话"): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser || !firstUser.content) return fallback;
  const raw = firstUser.content.replace(/\s+/g, " ").trim();
  if (!raw) return fallback;
  const maxLen = 20;
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...` : raw;
}

function generateTitleFromAssistantContent(content: string, fallback: string = "新对话"): string {
  if (!content) return fallback;
  // 去掉思维标签等包裹内容
  const cleaned = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/g, "")
    .replace(/[#>*\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  const firstSentenceEnd = cleaned.search(/[。.!？?]/);
  const base = firstSentenceEnd > 0 ? cleaned.slice(0, firstSentenceEnd) : cleaned;
  const maxLen = 20;
  const result = base.length > maxLen ? `${base.slice(0, maxLen)}...` : base;
  return result || fallback;
}

interface AIState {
  // Config
  config: AIConfig;
  setConfig: (config: Partial<AIConfig>) => void | Promise<void>;

  // Chat
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sessions: ChatSession[];
  currentSessionId: string | null;
  createSession: (title?: string) => void;
  deleteSession: (id: string) => void;
  switchSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  
  // Streaming
  isStreaming: boolean;
  streamingContent: string;
  streamingReasoning: string;
  
  // Token usage
  tokenUsage: TokenUsage;
  totalTokensUsed: number;

  // File references
  referencedFiles: FileReference[];
  addFileReference: (path: string, name: string) => Promise<void>;
  removeFileReference: (path: string) => void;
  clearFileReferences: () => void;

  // Edit suggestions
  pendingEdits: EditSuggestion[];
  clearPendingEdits: () => void;
  
  // Diff preview
  pendingDiff: PendingDiff | null;
  setPendingDiff: (diff: PendingDiff | null) => void;
  diffResolver: ((approved: boolean) => void) | null;
  setDiffResolver: (resolver: ((approved: boolean) => void) | null) => void;

  // Text selections (Add to Chat)
  textSelections: TextSelection[];
  addTextSelection: (text: string, source: string, sourcePath?: string) => void;
  removeTextSelection: (id: string) => void;
  clearTextSelections: () => void;

  // Actions
  sendMessage: (content: string, currentFile?: { path: string; name: string; content: string }, displayContent?: string) => Promise<void>;
  sendMessageStream: (content: string, currentFile?: { path: string; name: string; content: string }, displayContent?: string) => Promise<void>;
  stopStreaming: () => void;
  clearChat: () => void;
  retry: (currentFile?: { path: string; name: string; content: string }) => Promise<void>;  // 重新生成
  checkFirstLoad: () => void;
}

let hasInitialized = false;

export const useAIStore = create<AIState>()(
  persist(
    (set, get) => ({
      // Config
      config: getAIConfig(),
      setConfig: async (newConfig) => {
        console.log('[AI Debug] setConfig called', {
          hasApiKey: newConfig.apiKey !== undefined,
          provider: newConfig.provider,
          model: newConfig.model,
        });
        
        // 如果有新的 apiKey，先加密
        if (newConfig.apiKey !== undefined) {
          console.log('[AI Debug] Encrypting API key, original length:', newConfig.apiKey.length);
          const encryptedKey = await encryptApiKey(newConfig.apiKey);
          console.log('[AI Debug] Encrypted key length:', encryptedKey.length);
          
          newConfig = { ...newConfig, apiKey: newConfig.apiKey }; // 内存中保持明文
          // 同步到内存配置
          setAIConfig(newConfig);
          console.log('[AI Debug] Set in-memory config with plain key');
          
          // 存储时使用加密的 key
          set({ 
            config: { ...getAIConfig(), apiKey: encryptedKey } 
          });
          console.log('[AI Debug] Stored encrypted key to persist');
        } else {
          setAIConfig(newConfig);
          set({ config: getAIConfig() });
        }
      },

      // Chat state
      messages: [],
      isLoading: false,
      error: null,
  sessions: [],
  currentSessionId: null,
            // Session management
            createSession: (title) => {
              const createdAt = Date.now();
              const id = `chat-${createdAt}`;
              const session: ChatSession = {
                id,
                title: title || "新对话",
                createdAt,
                updatedAt: createdAt,
                messages: [],
              };
              set((state) => ({
                sessions: [...state.sessions, session],
                currentSessionId: id,
                messages: [],
              }));
            },

            deleteSession: (id) => {
              set((state) => {
                const sessions = state.sessions.filter((s) => s.id !== id);
                let currentSessionId = state.currentSessionId;
                if (currentSessionId === id) {
                  currentSessionId = sessions[0]?.id ?? null;
                }
                const current = sessions.find((s) => s.id === currentSessionId) || null;
                return {
                  sessions,
                  currentSessionId,
                  messages: current?.messages ?? [],
                };
              });
            },

            switchSession: (id) => {
              set((state) => {
                const session = state.sessions.find((s) => s.id === id);
                if (!session) return state;
                return {
                  ...state,
                  currentSessionId: id,
                  messages: session.messages,
                };
              });
            },

            renameSession: (id, title) => {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.id === id ? { ...s, title } : s
                ),
              }));
            },
      
      // Streaming state
      isStreaming: false,
      streamingContent: "",
      streamingReasoning: "",
      
      // Token usage
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      totalTokensUsed: 0,

      // File references
      referencedFiles: [],
      addFileReference: async (path, name) => {
        try {
          const content = await readFile(path);
          set((state) => ({
            referencedFiles: [
              ...state.referencedFiles.filter((f) => f.path !== path),
              { path, name, content },
            ],
          }));
        } catch (error) {
          console.error("Failed to read file:", error);
        }
      },
      removeFileReference: (path) => {
        set((state) => ({
          referencedFiles: state.referencedFiles.filter((f) => f.path !== path),
        }));
      },
      clearFileReferences: () => {
        set({ referencedFiles: [] });
      },

      // Edit suggestions
      pendingEdits: [],
      clearPendingEdits: () => {
        set({ pendingEdits: [], pendingDiff: null });
      },
      
      // Diff preview
      pendingDiff: null,
      setPendingDiff: (diff) => {
        set({ pendingDiff: diff });
      },
      diffResolver: null,
      setDiffResolver: (resolver) => {
        set({ diffResolver: resolver });
      },

      // Text selections (Add to Chat)
      textSelections: [],
      addTextSelection: (text, source, sourcePath) => {
        const id = `sel-${Date.now()}`;
        set((state) => ({
          textSelections: [...state.textSelections, { id, text, source, sourcePath }],
        }));
      },
      removeTextSelection: (id) => {
        set((state) => ({
          textSelections: state.textSelections.filter((s) => s.id !== id),
        }));
      },
      clearTextSelections: () => {
        set({ textSelections: [] });
      },

      // Send message
      sendMessage: async (content, currentFile, displayContent) => {
        const { referencedFiles, currentSessionId } = get();
        // 使用内存中的配置（已解密），而不是 store 中可能未同步的配置
        const config = getAIConfig();

        console.log('[AI Debug] sendMessage called', {
          contentLength: content.length,
          hasCurrentFile: !!currentFile,
          referencedFilesCount: referencedFiles.length,
          provider: config.provider,
          model: config.model,
          hasApiKey: !!config.apiKey,
          apiKeyLength: config.apiKey?.length || 0,
        });

        if (!config.apiKey && config.provider !== "ollama") {
          console.error('[AI Debug] No API key configured');
          set({ error: "请先在设置中配置 API Key" });
          return;
        }

        // Parse @file references in message
        const fileRefs = parseFileReferences(content);
        
        // Add user message (use displayContent for showing, content for AI)
        const userMessage: Message = { role: "user", content: displayContent || content };

        // 确保有当前会话
        if (!currentSessionId) {
          get().createSession();
        }

        // 先显示用户消息
        set((state) => {
          // 使用 state.messages 而不是闭包中的 messages，确保获取最新状态
          const newMessages = [...state.messages, userMessage];
          const newTitle = generateSessionTitleFromMessages(newMessages, "新对话");
          return {
            messages: newMessages,
            error: null,
            sessions: state.sessions.map((s) =>
              s.id === state.currentSessionId
                ? {
                    ...s,
                    title: s.title === "新对话" ? newTitle : s.title,
                    messages: newMessages,
                    updatedAt: Date.now(),
                  }
                : s
            ),
          };
        });

        // 短暂延迟后再显示 loading 状态
        await new Promise(resolve => setTimeout(resolve, 150));
        set({ isLoading: true });

        try {
          // Load any new referenced files
          for (const ref of fileRefs) {
            const existing = referencedFiles.find(
              (f) => f.path.includes(ref) || f.name.includes(ref)
            );
            if (!existing) {
              // Try to find and load the file
              // For now, assume it's in the vault
              await get().addFileReference(ref, ref);
            }
          }

          // Determine which files to send to AI
          // If user has manually added files, use those
          // Otherwise, use the current focused file
          let filesToSend = get().referencedFiles;
          if (filesToSend.length === 0 && currentFile) {
            filesToSend = [currentFile];
          }

          console.log('[AI Debug] Calling AI with:', {
            messagesCount: get().messages.length,
            filesToSendCount: filesToSend.length,
            provider: config.provider,
            model: config.model,
          });

          console.log('[AI Debug] About to call chat()...');
          
          // 准备配置覆盖 (如果启用了路由且配置了聊天模型)
          let configOverride: Partial<AIConfig> | undefined = undefined;
          if (config.routing?.enabled && config.routing.chatProvider) {
             configOverride = {
               provider: config.routing.chatProvider,
               apiKey: config.routing.chatApiKey || config.apiKey,
               model: config.routing.chatModel,
               customModelId: config.routing.chatCustomModelId,
               baseUrl: config.routing.chatBaseUrl,
             };
             console.log('[AI] Using chat model:', configOverride.model);
          }

          let response;
          try {
            // Call AI - 使用最新的 messages 状态
            // 强制使用 "chat" 意图以启用灵感助手 Prompt
            response = await chat(
              [...get().messages],
              filesToSend,
              configOverride,
              { intent: "chat" }
            );
            console.log('[AI Debug] chat() returned successfully');
          } catch (chatError) {
            console.error('[AI Debug] chat() threw error:', chatError);
            throw chatError;
          }

          console.log('[AI Debug] AI response received:', {
            contentLength: response.content?.length || 0,
            hasUsage: !!response.usage,
          });

          // Parse edit suggestions from content
          const edits = parseEditSuggestions(response.content);
          console.log("[AI] Parsed edits:", edits);

          // Update token usage
          const newUsage = response.usage ? {
            prompt: response.usage.prompt_tokens,
            completion: response.usage.completion_tokens,
            total: response.usage.total_tokens,
          } : { prompt: 0, completion: 0, total: 0 };

          console.log('[AI Debug] Adding assistant message to state:', {
            contentLength: response.content.length,
            contentPreview: response.content.substring(0, 100),
            editsCount: edits.length,
          });

          // Add assistant message and update tokens
          set((state) => {
            const assistantMessage: Message = { role: "assistant", content: response.content };
            const newMessages = [...state.messages, assistantMessage];
            const newTitle = generateTitleFromAssistantContent(response.content, "新对话");
            
            console.log('[AI Debug] State update:', {
              oldMessagesCount: state.messages.length,
              newMessagesCount: newMessages.length,
              sessionId: state.currentSessionId,
            });
            
            return {
              messages: newMessages,
              pendingEdits: edits.length > 0 ? edits : state.pendingEdits,
              tokenUsage: newUsage,
              totalTokensUsed: state.totalTokensUsed + newUsage.total,
              isLoading: false,
              sessions: state.sessions.map((s) =>
                s.id === state.currentSessionId
                  ? {
                      ...s,
                      title: s.title === "新对话" ? newTitle : s.title,
                      messages: newMessages,
                      updatedAt: Date.now(),
                    }
                  : s
              ),
            };
          });
          
          // Auto-show diff after a short delay (to avoid render issues)
          if (edits.length > 0 && filesToSend.length > 0) {
            // Capture the data we need before setTimeout
            const edit = edits[0];
            const file = filesToSend.find(f => 
              f.path?.toLowerCase().includes(edit.filePath.replace(/\.md$/, "").toLowerCase()) ||
              f.name?.toLowerCase().includes(edit.filePath.replace(/\.md$/, "").toLowerCase())
            ) || filesToSend[0];
            
            if (file && file.content && file.path) {
              console.log("=== DEBUG: Auto Diff ===");
              console.log("[1] File name:", file.name);
              console.log("[2] File path:", file.path);
              console.log("[3] File content (first 200 chars):", file.content.substring(0, 200));
              console.log("[4] Edit filePath:", edit.filePath);
              console.log("[5] Edit originalContent:", edit.originalContent);
              console.log("[6] Edit newContent:", edit.newContent);
              console.log("[7] Does file contain originalContent?", file.content.includes(edit.originalContent));
              
              const modified = applyEdit(file.content, edit);
              console.log("[8] Modified length:", modified.length, "Original length:", file.content.length);
              console.log("[9] Content changed:", modified !== file.content);
              console.log("[10] Modified (first 200 chars):", modified.substring(0, 200));
              
              if (modified !== file.content) {
                // Capture values for closure
                const diffData = {
                  fileName: file.name,
                  filePath: file.path,
                  original: file.content,
                  modified,
                  description: edit.description,
                };
                // Delay setting pendingDiff to let UI settle
                setTimeout(() => {
                  get().setPendingDiff(diffData);
                }, 100);
              }
            }
          }
        } catch (error) {
          console.error('[AI Debug] Error in sendMessage:', error);
          console.error('[AI Debug] Error details:', {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            config: {
              provider: config.provider,
              model: config.model,
              hasApiKey: !!config.apiKey,
            },
          });
          set({
            error: error instanceof Error ? error.message : "发送消息失败",
            isLoading: false,
          });
        }
      },

      // 流式发送消息
      sendMessageStream: async (content, currentFile, displayContent) => {
        const { referencedFiles, config, currentSessionId } = get();

        // Add user message (use displayContent for showing, content for AI)
        const userMessage: Message = { role: "user", content: displayContent || content };

        if (!currentSessionId) {
          get().createSession();
        }

        // 先显示用户消息
        set((state) => {
          // 使用 state.messages 而不是闭包中的 messages，确保获取最新状态
          const newMessages = [...state.messages, userMessage];
          const newTitle = generateSessionTitleFromMessages(newMessages, "新对话");
          return {
            messages: newMessages,
            streamingContent: "",
            streamingReasoning: "",
            error: null,
            sessions: state.sessions.map((s) =>
              s.id === state.currentSessionId
                ? {
                    ...s,
                    title: s.title === "新对话" ? newTitle : s.title,
                    messages: newMessages,
                    updatedAt: Date.now(),
                  }
                : s
            ),
          };
        });

        // 短暂延迟后再显示 streaming 状态
        await new Promise(resolve => setTimeout(resolve, 150));
        set({ isStreaming: true });

        if (!config.apiKey && config.provider !== "ollama") {
          set({ error: "请先在设置中配置 API Key" });
          return;
        }

        try {
          // Prepare files
          let filesToSend = referencedFiles;
          if (filesToSend.length === 0 && currentFile) {
            filesToSend = [currentFile];
          }

          // Build messages with context
          const basePrompt = `你是一个灵感与写作建议助手。
你的主要目标是激发用户的创造力，提供写作角度、结构优化建议和内容润色方案。
请专注于提供思路、大纲、修辞建议或具体的段落示例，而不是直接执行文件操作。
当用户询问或卡顿时，请提供建设性的反馈、启发性的问题或相关的灵感素材。
请始终使用与用户消息相同的语言进行回复。`;
          
          const systemMessage = filesToSend.length > 0
            ? `${basePrompt}\n\n当前上下文文件：\n\n${filesToSend.map(f => 
                `### ${f.name}\n\`\`\`\n${f.content}\n\`\`\``
              ).join("\n\n")}`
            : basePrompt;

          // 从 store 获取最新的 messages，而不是使用闭包中的旧值
          const currentMessages = get().messages;
          
          // 包装用户消息为 XML 格式（某些 API 代理需要结构化消息才能正常返回内容）
          const llmMessages = [
            { role: "system" as const, content: systemMessage },
            ...currentMessages.map(m => ({
              role: m.role,
              content: m.role === "user" ? `<message>\n${m.content}\n</message>` : m.content,
            })),
          ];

          // 准备配置覆盖 (如果启用了路由且配置了聊天模型)
          let configOverride: Partial<AIConfig> | undefined = undefined;
          if (config.routing?.enabled && config.routing.chatProvider) {
             configOverride = {
               provider: config.routing.chatProvider,
               apiKey: config.routing.chatApiKey || config.apiKey,
               model: config.routing.chatModel,
               customModelId: config.routing.chatCustomModelId,
               baseUrl: config.routing.chatBaseUrl,
             };
             console.log('[AI] Using chat model:', configOverride.model);
          }

          // 使用 callLLM 而不是 callLLMStream（与 Agent 模式保持一致）
          console.log('[AI Debug] Calling callLLM with messages:', llmMessages.length);
          
          const response = await callLLM(llmMessages, undefined, configOverride);
          console.log('[AI Debug] callLLM response:', {
            contentLength: response.content?.length || 0,
            hasUsage: !!response.usage,
          });

          const finalContent = response.content || "";
          
          // Update token usage
          if (response.usage) {
            set((state) => ({
              tokenUsage: {
                prompt: response.usage!.promptTokens,
                completion: response.usage!.completionTokens,
                total: response.usage!.totalTokens,
              },
              totalTokensUsed: state.totalTokensUsed + response.usage!.totalTokens,
            }));
          }

          // Parse edit suggestions from content
          const edits = parseEditSuggestions(finalContent);
          console.log("[AI] Parsed edits:", edits);

          set((state) => {
            const assistantMessage: Message = { role: "assistant", content: finalContent };
            const newMessages = [...state.messages, assistantMessage];
            const newTitle = generateTitleFromAssistantContent(finalContent, "新对话");
            return {
              messages: newMessages,
              pendingEdits: edits.length > 0 ? edits : state.pendingEdits,
              isStreaming: false,
              streamingContent: "",
              streamingReasoning: "",
              sessions: state.sessions.map((s) =>
                s.id === state.currentSessionId
                  ? {
                      ...s,
                      title: s.title === "新对话" ? newTitle : s.title,
                      messages: newMessages,
                      updatedAt: Date.now(),
                    }
                  : s
              ),
            };
          });

          // Auto-show diff after a short delay (to avoid render issues)
          if (edits.length > 0 && filesToSend.length > 0) {
            // Capture the data we need before setTimeout
            const edit = edits[0];
            const file = filesToSend.find(f => 
              f.path?.toLowerCase().includes(edit.filePath.replace(/\.md$/, "").toLowerCase()) ||
              f.name?.toLowerCase().includes(edit.filePath.replace(/\.md$/, "").toLowerCase())
            ) || filesToSend[0];
            
            if (file && file.content && file.path) {
              const modified = applyEdit(file.content, edit);
              if (modified !== file.content) {
                const diffData = {
                  fileName: file.name,
                  filePath: file.path,
                  original: file.content,
                  modified,
                  description: edit.description,
                };
                setTimeout(() => {
                  get().setPendingDiff(diffData);
                }, 100);
              }
            }
          }
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : "发送消息失败",
            isStreaming: false,
          });
        }
      },

      // 停止流式
      stopStreaming: () => {
        set({ isStreaming: false });
      },

      // Clear chat
      clearChat: () => {
        set((state) => ({
          messages: [],
          pendingEdits: [],
          error: null,
          streamingContent: "",
          streamingReasoning: "",
          sessions: state.sessions.map((s) =>
            s.id === state.currentSessionId
              ? { ...s, messages: [], updatedAt: Date.now() }
              : s
          ),
        }));
      },

      // 重新生成最后一条 AI 回复
      retry: async (currentFile) => {
        const { messages } = get();
        
        // 找到最后一条用户消息
        const lastUserIndex = [...messages].reverse().findIndex(m => m.role === "user");
        if (lastUserIndex === -1) return;
        
        const actualIndex = messages.length - 1 - lastUserIndex;
        const lastUserMessage = messages[actualIndex];
        const userContent = lastUserMessage.content;
        
        // 删除最后一条用户消息及之后的所有消息
        const newMessages = messages.slice(0, actualIndex);
        
        // 更新状态
        set((state) => ({
          messages: newMessages,
          sessions: state.sessions.map((s) =>
            s.id === state.currentSessionId
              ? { ...s, messages: newMessages, updatedAt: Date.now() }
              : s
          ),
        }));
        
        // 重新发送（使用流式）
        await get().sendMessageStream(userContent, currentFile);
      },

      checkFirstLoad: () => {
        if (!hasInitialized) {
          hasInitialized = true;
          const { sessions, currentSessionId } = get();
          const currentSession = sessions.find(s => s.id === currentSessionId);
          
          // 如果当前会话存在且有消息，则创建新会话
          // 如果当前会话不存在，也创建新会话
          // 如果当前会话存在但为空（messages.length === 0），则复用它（不创建新的）
          if (!currentSession || currentSession.messages.length > 0) {
            get().createSession();
          }
        }
      },
    }),
    {
      name: "lumina-ai",
      partialize: (state) => ({
        config: state.config,
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
      }),
      onRehydrateStorage: () => async (state) => {
        console.log('[AI Debug] Rehydrating storage...');
        // 恢复数据后，解密 apiKey 并同步 config 到内存
        if (state?.config) {
          console.log('[AI Debug] Stored config:', {
            provider: state.config.provider,
            model: state.config.model,
            encryptedKeyLength: state.config.apiKey?.length || 0,
          });
          
          try {
            const decryptedKey = await decryptApiKey(state.config.apiKey || "");
            console.log('[AI Debug] Decrypted key length:', decryptedKey.length);
            
            const decryptedConfig = { ...state.config, apiKey: decryptedKey };
            setAIConfig(decryptedConfig);
            // 更新 store 中的明文配置（仅内存，不触发 persist）
            useAIStore.setState({ config: decryptedConfig });
            
            console.log('[AI Debug] Config rehydrated successfully');
          } catch (error) {
            console.error('[AI Debug] Failed to decrypt API key:', error);
          }
        } else {
          console.log('[AI Debug] No config to rehydrate');
        }
      },
    }
  )
);
