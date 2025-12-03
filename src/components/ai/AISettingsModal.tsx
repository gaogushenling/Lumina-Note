import { useAIStore } from "@/stores/useAIStore";
import { useAgentStore } from "@/stores/useAgentStore";
import { useRAGStore } from "@/stores/useRAGStore";
import { PROVIDER_REGISTRY, type LLMProviderType } from "@/services/llm";
import { Settings, Tag, Loader2 } from "lucide-react";

interface AISettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AISettingsModal({ isOpen, onClose }: AISettingsModalProps) {
  const { config, setConfig } = useAIStore();
  const { autoApprove, setAutoApprove } = useAgentStore();
  const {
    config: ragConfig,
    setConfig: setRAGConfig,
    isIndexing: ragIsIndexing,
    indexStatus,
    rebuildIndex,
    cancelIndex,
    lastError: ragError,
  } = useRAGStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 模态内容 */}
      <div className="relative w-[520px] max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden border border-border bg-background/95 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/60">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Settings size={16} />
            <span>AI 对话设置</span>
          </div>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
          >
            关闭
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* AI Provider Settings */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-foreground flex items-center gap-2">
              <span>🤖 主模型 (Main Model)</span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">服务商</label>
              <select
                value={config.provider}
                onChange={(e) => {
                  const provider = e.target.value as LLMProviderType;
                  const providerMeta = PROVIDER_REGISTRY[provider];
                  const defaultModel = providerMeta?.models[0]?.id || "";
                  setConfig({ provider, model: defaultModel });
                }}
                className="w-full text-xs p-2 rounded border border-border bg-background"
              >
                {Object.entries(PROVIDER_REGISTRY).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label} - {meta.description}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                API Key {config.provider === "ollama" && <span className="text-muted-foreground">(可选)</span>}
              </label>
              <input
                type="password"
                value={config.apiKey}
                onChange={(e) => setConfig({ apiKey: e.target.value })}
                placeholder={
                  config.provider === "ollama"
                    ? "本地模型无需 API Key"
                    : config.provider === "anthropic"
                      ? "sk-ant-..."
                      : "sk-..."
                }
                className="w-full text-xs p-2 rounded border border-border bg-background"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">模型</label>
              <select
                value={
                  PROVIDER_REGISTRY[config.provider as LLMProviderType]?.models.some(m => m.id === config.model)
                    ? config.model
                    : "custom"
                }
                onChange={(e) => {
                  const newModel = e.target.value;
                  if (newModel === "custom") {
                    setConfig({ model: newModel, customModelId: "" });
                  } else {
                    setConfig({ model: newModel });
                  }
                }}
                className="w-full text-xs p-2 rounded border border-border bg-background"
              >
                {PROVIDER_REGISTRY[config.provider as LLMProviderType]?.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} {model.supportsThinking ? "🧠" : ""}
                  </option>
                ))}
              </select>
            </div>

            {config.model === "custom" && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">自定义模型 ID</label>
                <input
                  type="text"
                  value={config.customModelId || ""}
                  onChange={(e) => setConfig({ customModelId: e.target.value })}
                  placeholder="例如：deepseek-ai/DeepSeek-V3 或 Pro/ERNIE-4.0-Turbo-8K"
                  className="w-full text-xs p-2 rounded border border-border bg-background"
                />
              </div>
            )}

            {config.model === "custom" && (
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Base URL <span className="text-muted-foreground">(可选，用于第三方代理)</span>
                </label>
                <input
                  type="text"
                  value={config.baseUrl || ""}
                  onChange={(e) => setConfig({ baseUrl: e.target.value || undefined })}
                  placeholder={PROVIDER_REGISTRY[config.provider as LLMProviderType]?.defaultBaseUrl}
                  className="w-full text-xs p-2 rounded border border-border bg-background"
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">温度 (Temperature)</label>
                <span className="text-xs text-muted-foreground">{config.temperature ?? 0.3}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature ?? 0.3}
                onChange={(e) => setConfig({ temperature: parseFloat(e.target.value) })}
                className="w-full accent-primary h-1 bg-muted rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>

          {/* 动态路由设置 */}
          <div className="space-y-2 pt-3 border-t border-border">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span className="flex items-center gap-1">
                <span className="text-lg">⚡</span>
                动态路由 (Intent Routing)
              </span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.routing?.enabled || false}
                  onChange={(e) => {
                    const currentRouting = config.routing || {
                      enabled: false,
                      targetIntents: ["chat", "search"] as any,
                    };
                    // 强制设置 targetIntents 为 chat 和 search
                    setConfig({ 
                      routing: { 
                        ...currentRouting, 
                        enabled: e.target.checked,
                        targetIntents: ["chat", "search"]
                      } 
                    });
                  }}
                  className="w-3 h-3"
                />
                <span className="text-xs text-muted-foreground">启用</span>
              </label>
            </div>

            {config.routing?.enabled && (
              <div className="space-y-4 pl-2 border-l-2 border-muted ml-1">
                <div className="text-xs text-muted-foreground">
                  配置意图识别模型和路由规则。
                </div>

                {/* 1. 意图识别模型配置 */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-foreground">🧠 意图识别模型 (Intent Model)</div>
                  <div className="text-[10px] text-muted-foreground mb-1">用于分析用户意图 (Chat/Search/Edit/...)</div>
                  
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">服务商</label>
                    <select
                      value={config.routing.intentProvider || config.provider}
                      onChange={(e) => {
                        const provider = e.target.value as LLMProviderType;
                        const providerMeta = PROVIDER_REGISTRY[provider];
                        const defaultModel = providerMeta?.models[0]?.id || "";
                        const currentRouting = config.routing!;
                        setConfig({ 
                          routing: { 
                            ...currentRouting, 
                            intentProvider: provider,
                            intentModel: defaultModel
                          } 
                        });
                      }}
                      className="w-full text-xs p-2 rounded border border-border bg-background"
                    >
                      {Object.entries(PROVIDER_REGISTRY).map(([key, meta]) => (
                        <option key={key} value={key}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">
                      API Key <span className="text-muted-foreground">(留空则使用主 Key)</span>
                    </label>
                    <input
                      type="password"
                      value={config.routing.intentApiKey || ""}
                      onChange={(e) => {
                        const currentRouting = config.routing!;
                        setConfig({ 
                          routing: { ...currentRouting, intentApiKey: e.target.value } 
                        });
                      }}
                      placeholder="sk-..."
                      className="w-full text-xs p-2 rounded border border-border bg-background"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">模型</label>
                    <select
                      value={
                        PROVIDER_REGISTRY[(config.routing.intentProvider || config.provider) as LLMProviderType]?.models.some(m => m.id === config.routing?.intentModel)
                          ? config.routing.intentModel
                          : "custom"
                      }
                      onChange={(e) => {
                        const newModel = e.target.value;
                        const currentRouting = config.routing!;
                        if (newModel === "custom") {
                          setConfig({ 
                            routing: { ...currentRouting, intentModel: "custom", intentCustomModelId: "" } 
                          });
                        } else {
                          setConfig({ 
                            routing: { ...currentRouting, intentModel: newModel } 
                          });
                        }
                      }}
                      className="w-full text-xs p-2 rounded border border-border bg-background"
                    >
                      {PROVIDER_REGISTRY[(config.routing.intentProvider || config.provider) as LLMProviderType]?.models.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {config.routing.intentModel === "custom" && (
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">自定义模型 ID</label>
                      <input
                        type="text"
                        value={config.routing.intentCustomModelId || ""}
                        onChange={(e) => {
                          const currentRouting = config.routing!;
                          setConfig({ 
                            routing: { ...currentRouting, intentCustomModelId: e.target.value } 
                          });
                        }}
                        placeholder="例如：deepseek-ai/DeepSeek-V3"
                        className="w-full text-xs p-2 rounded border border-border bg-background"
                      />
                    </div>
                  )}

                  {config.routing.intentModel === "custom" && (
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Base URL <span className="text-muted-foreground">(可选)</span>
                      </label>
                      <input
                        type="text"
                        value={config.routing.intentBaseUrl || ""}
                        onChange={(e) => {
                          const currentRouting = config.routing!;
                          setConfig({ 
                            routing: { ...currentRouting, intentBaseUrl: e.target.value } 
                          });
                        }}
                        placeholder={PROVIDER_REGISTRY[(config.routing.intentProvider || config.provider) as LLMProviderType]?.defaultBaseUrl}
                        className="w-full text-xs p-2 rounded border border-border bg-background"
                      />
                    </div>
                  )}
                </div>

                {/* 2. 聊天模型配置 */}
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div className="text-xs font-medium text-foreground">💬 聊天模型 (Chat Model)</div>
                  <div className="text-[10px] text-muted-foreground mb-1">用于 Chat 模式和简单任务 (如闲聊、搜索)</div>
                  
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">服务商</label>
                    <select
                      value={config.routing.chatProvider || ""}
                      onChange={(e) => {
                        const provider = e.target.value;
                        const currentRouting = config.routing!;
                        
                        if (!provider) {
                          setConfig({ 
                            routing: { 
                              ...currentRouting, 
                              chatProvider: undefined,
                              chatApiKey: undefined,
                              chatModel: undefined,
                              chatCustomModelId: undefined,
                              chatBaseUrl: undefined
                            } 
                          });
                          return;
                        }

                        const providerMeta = PROVIDER_REGISTRY[provider as LLMProviderType];
                        const defaultModel = providerMeta?.models[0]?.id || "";
                        
                        setConfig({ 
                          routing: { 
                            ...currentRouting, 
                            chatProvider: provider as LLMProviderType,
                            chatModel: defaultModel
                          } 
                        });
                      }}
                      className="w-full text-xs p-2 rounded border border-border bg-background"
                    >
                      <option value="">🔄 跟随主模型 (默认)</option>
                      {Object.entries(PROVIDER_REGISTRY).map(([key, meta]) => (
                        <option key={key} value={key}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!config.routing.chatProvider ? (
                    <div className="p-2 bg-muted/50 rounded border border-border/50 text-[10px] text-muted-foreground">
                      <span className="text-amber-500 mr-1">⚠️</span>
                      未配置专用聊天模型，将使用主模型处理所有任务。建议配置轻量级模型（如 GPT-4o-mini, Gemini Flash）以降低成本并提高速度。
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">
                          API Key <span className="text-muted-foreground">(留空则使用主 Key)</span>
                        </label>
                        <input
                          type="password"
                          value={config.routing.chatApiKey || ""}
                          onChange={(e) => {
                            const currentRouting = config.routing!;
                            setConfig({ 
                              routing: { ...currentRouting, chatApiKey: e.target.value } 
                            });
                          }}
                          placeholder="sk-..."
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">模型</label>
                        <select
                          value={
                            PROVIDER_REGISTRY[config.routing.chatProvider as LLMProviderType]?.models.some(m => m.id === config.routing?.chatModel)
                              ? config.routing.chatModel
                              : "custom"
                          }
                          onChange={(e) => {
                            const newModel = e.target.value;
                            const currentRouting = config.routing!;
                            if (newModel === "custom") {
                              setConfig({ 
                                routing: { ...currentRouting, chatModel: "custom", chatCustomModelId: "" } 
                              });
                            } else {
                              setConfig({ 
                                routing: { ...currentRouting, chatModel: newModel } 
                              });
                            }
                          }}
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        >
                          {PROVIDER_REGISTRY[config.routing.chatProvider as LLMProviderType]?.models.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {config.routing.chatModel === "custom" && (
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">自定义模型 ID</label>
                          <input
                            type="text"
                            value={config.routing.chatCustomModelId || ""}
                            onChange={(e) => {
                              const currentRouting = config.routing!;
                              setConfig({ 
                                routing: { ...currentRouting, chatCustomModelId: e.target.value } 
                              });
                            }}
                            placeholder="例如：deepseek-ai/DeepSeek-V3"
                            className="w-full text-xs p-2 rounded border border-border bg-background"
                          />
                        </div>
                      )}

                      {config.routing.chatModel === "custom" && (
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">
                            Base URL <span className="text-muted-foreground">(可选)</span>
                          </label>
                          <input
                            type="text"
                            value={config.routing.chatBaseUrl || ""}
                            onChange={(e) => {
                              const currentRouting = config.routing!;
                              setConfig({ 
                                routing: { ...currentRouting, chatBaseUrl: e.target.value } 
                              });
                            }}
                            placeholder={PROVIDER_REGISTRY[config.routing.chatProvider as LLMProviderType]?.defaultBaseUrl}
                            className="w-full text-xs p-2 rounded border border-border bg-background"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* 3. 路由规则说明 */}
                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div className="text-xs font-medium text-foreground">📋 路由规则</div>
                  <div className="text-[10px] text-muted-foreground">
                    系统将自动使用"聊天模型"处理以下任务，以节省成本并提高速度：
                    <ul className="list-disc list-inside mt-1 space-y-0.5 text-muted-foreground/80">
                      <li>💬 闲聊 (Chat) - 日常对话、灵感启发</li>
                      <li>🔍 搜索 (Search) - 知识检索、信息查询</li>
                    </ul>
                    <div className="mt-1 text-[10px] opacity-70">
                      * 其他复杂任务（如编辑、整理、写作）将始终使用"主模型"以保证质量。
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Agent 设置 */}
          <div className="space-y-2 pt-3 border-t border-border">
            <div className="text-xs font-medium text-foreground">🤖 Agent 设置</div>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(e) => setAutoApprove(e.target.checked)}
                className="w-3 h-3 rounded border-border"
              />
              自动批准工具调用
              <span className="text-muted-foreground">(无需手动确认)</span>
            </label>
          </div>

          {/* RAG 设置（完整，与 RightPanel 同步） */}
          <div className="space-y-2 pt-3 border-t border-border">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span className="flex items-center gap-1">
                <Tag size={12} />
                语义搜索 (RAG)
              </span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ragConfig.enabled}
                  onChange={(e) => setRAGConfig({ enabled: e.target.checked })}
                  className="w-3 h-3"
                />
                <span className="text-xs text-muted-foreground">启用</span>
              </label>
            </div>

            {ragConfig.enabled && (
              <>
                {/* RAG 当前状态 + 操作按钮 */}
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">
                    {ragIsIndexing
                      ? `正在索引${
                          typeof indexStatus?.progress === "number"
                            ? `：${Math.round(indexStatus.progress * 100)}%`
                            : "..."
                        }`
                      : indexStatus
                        ? `已索引 ${indexStatus.totalChunks ?? 0} 个片段`
                        : "尚未建立索引"}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={rebuildIndex}
                      disabled={ragIsIndexing}
                      className="px-2 py-1 rounded border border-border text-xs hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      重新索引
                    </button>
                    {ragIsIndexing && (
                      <button
                        type="button"
                        onClick={cancelIndex}
                        className="px-2 py-1 rounded border border-red-500/60 text-xs text-red-500 hover:bg-red-500/10"
                      >
                        取消索引
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Embedding 服务</label>
                  <select
                    value={ragConfig.embeddingProvider}
                    onChange={(e) => {
                      const provider = e.target.value as "openai" | "ollama";
                      const defaultModels: Record<string, string> = {
                        openai: "text-embedding-3-small",
                        ollama: "nomic-embed-text",
                      };
                      setRAGConfig({
                        embeddingProvider: provider,
                        embeddingModel: defaultModels[provider],
                      });
                    }}
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="ollama">Ollama (本地)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Embedding API Key
                    {ragConfig.embeddingProvider === "ollama" && (
                      <span className="text-muted-foreground/60 ml-1">(可选)</span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={ragConfig.embeddingApiKey || ""}
                    onChange={(e) => setRAGConfig({ embeddingApiKey: e.target.value })}
                    placeholder={
                      ragConfig.embeddingProvider === "openai" ? "sk-..." : "http://localhost:11434"
                    }
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Embedding Base URL</label>
                  <input
                    type="text"
                    value={ragConfig.embeddingBaseUrl || ""}
                    onChange={(e) => setRAGConfig({ embeddingBaseUrl: e.target.value })}
                    placeholder={
                      ragConfig.embeddingProvider === "openai"
                        ? "https://api.openai.com/v1"
                        : "http://localhost:11434"
                    }
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Embedding 模型</label>
                  <input
                    type="text"
                    value={ragConfig.embeddingModel}
                    onChange={(e) => setRAGConfig({ embeddingModel: e.target.value })}
                    placeholder="Qwen/Qwen3-Embedding-8B"
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    向量维度
                    <span className="text-muted-foreground/60 ml-1">(可选)</span>
                  </label>
                  <input
                    type="number"
                    value={ragConfig.embeddingDimensions || ""}
                    onChange={(e) =>
                      setRAGConfig({
                        embeddingDimensions: e.target.value ? parseInt(e.target.value) : undefined,
                      })
                    }
                    placeholder="如 1024（留空使用默认）"
                    className="w-full text-xs p-2 rounded border border-border bg-background"
                  />
                </div>

                {/* Reranker Settings */}
                <div className="border-t border-border pt-3 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium">重排序 (Reranker)</span>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={ragConfig.rerankerEnabled || false}
                        onChange={(e) => setRAGConfig({ rerankerEnabled: e.target.checked })}
                        className="w-3 h-3"
                      />
                      <span className="text-xs text-muted-foreground">启用</span>
                    </label>
                  </div>

                  {ragConfig.rerankerEnabled && (
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Reranker Base URL</label>
                        <input
                          type="text"
                          value={ragConfig.rerankerBaseUrl || ""}
                          onChange={(e) => setRAGConfig({ rerankerBaseUrl: e.target.value })}
                          placeholder="https://api.siliconflow.cn/v1"
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Reranker API Key</label>
                        <input
                          type="password"
                          value={ragConfig.rerankerApiKey || ""}
                          onChange={(e) => setRAGConfig({ rerankerApiKey: e.target.value })}
                          placeholder="sk-..."
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">Reranker 模型</label>
                        <input
                          type="text"
                          value={ragConfig.rerankerModel || ""}
                          onChange={(e) => setRAGConfig({ rerankerModel: e.target.value })}
                          placeholder="BAAI/bge-reranker-v2-m3"
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">返回数量 (Top N)</label>
                        <input
                          type="number"
                          value={ragConfig.rerankerTopN || 5}
                          onChange={(e) =>
                            setRAGConfig({ rerankerTopN: parseInt(e.target.value) || 5 })
                          }
                          min={1}
                          max={20}
                          className="w-full text-xs p-2 rounded border border-border bg-background"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Index Status */}
                <div className="bg-muted/50 rounded p-2 space-y-2 mt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">索引状态</span>
                    {ragIsIndexing ? (
                      <span className="text-yellow-500 flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" />
                        索引中...
                      </span>
                    ) : indexStatus?.initialized ? (
                      <span className="text-green-500">✓ 已就绪</span>
                    ) : (
                      <span className="text-muted-foreground">未初始化</span>
                    )}
                  </div>

                  {ragIsIndexing && indexStatus?.progress && typeof indexStatus.progress !== "number" && (
                    <div className="space-y-1">
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{
                            width: `${Math.round(
                              (indexStatus.progress.current /
                                Math.max(indexStatus.progress.total, 1)) * 100
                            )}%`,
                          }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground flex justify-between">
                        <span>
                          {indexStatus.progress.current} / {indexStatus.progress.total} 文件
                        </span>
                        <span>
                          {Math.round(
                            (indexStatus.progress.current /
                              Math.max(indexStatus.progress.total, 1)) * 100
                          )}%
                        </span>
                      </div>
                      {indexStatus.progress.currentFile && (
                        <div
                          className="text-xs text-muted-foreground truncate"
                          title={indexStatus.progress.currentFile}
                        >
                          正在处理: {indexStatus.progress.currentFile.split(/[/\\]/).pop()}
                        </div>
                      )}
                    </div>
                  )}

                  {!ragIsIndexing && indexStatus && (
                    <div className="text-xs text-muted-foreground">
                      {indexStatus.totalFiles} 个文件, {indexStatus.totalChunks} 个块
                    </div>
                  )}

                  {ragError && (
                    <div className="text-xs text-red-500">
                      {ragError}
                    </div>
                  )}

                  <button
                    onClick={() => rebuildIndex()}
                    disabled={ragIsIndexing || (ragConfig.embeddingProvider === 'openai' && !ragConfig.embeddingApiKey)}
                    className="w-full text-xs py-1 px-2 bg-primary/10 hover:bg-primary/20 text-primary rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {ragIsIndexing ? "索引中..." : "重建索引"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
