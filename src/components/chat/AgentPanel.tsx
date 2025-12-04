/**
 * Agent 面板组件
 * 
 * 提供与 Agent 交互的聊天界面
 */

import { useState, useRef, useEffect } from "react";
import { useAgentStore } from "@/stores/useAgentStore";
import { useFileStore } from "@/stores/useFileStore";
import { MODES, getModeList } from "@/agent/modes";
import { AgentModeSlug } from "@/agent/types";
import { ChatInput } from "./ChatInput";
import { AgentMessageRenderer } from "./AgentMessageRenderer";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { processMessageWithFiles, type ReferencedFile } from "@/hooks/useChatSend";
import {
  Square,
  Check,
  X,
  Trash2,
  ChevronDown,
  Loader2,
  AlertCircle,
  Bot,
  Mic,
  MicOff,
  Send,
  RefreshCw,
} from "lucide-react";

export function AgentPanel() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { isRecording, interimText, toggleRecording } = useSpeechToText((text: string) => {
    setInput((prev) => (prev ? prev + " " + text : text));
  });

  const {
    status,
    messages,
    pendingTool,
    mode,
    setMode,
    startTask,
    abort,
    approve,
    reject,
    clearChat,
    retry,
    llmRequestStartTime,
    retryTimeout,
  } = useAgentStore();

  const { vaultPath, currentFile, currentContent } = useFileStore();

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  // 发送消息（支持引用文件）
  const handleSendWithFiles = async (message: string, referencedFiles: ReferencedFile[]) => {
    if ((!message.trim() && referencedFiles.length === 0) || status === "running") return;

    setInput("");

    // 使用共享函数处理消息和文件
    const { displayMessage, fullMessage } = await processMessageWithFiles(message, referencedFiles);

    await startTask(fullMessage, {
      workspacePath: vaultPath || "",
      activeNote: currentFile || undefined,
      activeNoteContent: currentFile ? currentContent : undefined,
      displayMessage,
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Lumina Agent</span>
        </div>
        <div className="flex items-center gap-2">
          {/* 模式选择 */}
          <ModeSelector mode={mode} onChange={setMode} />
          {/* 清空按钮 */}
          <button
            onClick={clearChat}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="清空对话"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 欢迎消息 */}
        {messages.length === 0 && (
          <div className="text-sm text-muted-foreground leading-relaxed">
            <p>{MODES[mode].roleDefinition}</p>
            <p className="mt-2 text-xs opacity-70">输入任务指令开始</p>
          </div>
        )}

        {/* 消息列表 - 使用 AgentMessageRenderer 组件 */}
        <AgentMessageRenderer
          messages={messages}
          isRunning={status === "running"}
          llmRequestStartTime={llmRequestStartTime}
          onRetryTimeout={() => retryTimeout({
            workspacePath: vaultPath || "",
            activeNote: currentFile || undefined,
            activeNoteContent: currentFile ? currentContent : undefined,
          })}
        />

        {/* 工具审批 */}
        {pendingTool && status === "waiting_approval" && (
          <ToolApproval
            toolName={pendingTool.name}
            params={pendingTool.params}
            onApprove={approve}
            onReject={reject}
          />
        )}

        {/* 加载状态 */}
        {status === "running" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>思考中...</span>
          </div>
        )}

        {/* 错误状态 */}
        {status === "error" && (
          <div className="text-sm text-red-500 p-2 bg-red-500/10 rounded">
            发生错误，请重试
          </div>
        )}

        {/* Retry 按钮 - 只在有消息且不在运行时显示 */}
        {messages.length > 0 && messages.some(m => m.role === "assistant") && status !== "running" && (
          <div className="flex justify-end">
            <button
              onClick={() => {
                if (!vaultPath) return;
                retry({
                  workspacePath: vaultPath,
                  activeNote: currentFile || undefined,
                  activeNoteContent: currentContent || undefined,
                });
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
              title="重新生成"
            >
              <RefreshCw size={12} />
              重新生成
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 - 样式对齐 Chat 输入框（自定义 textarea + 统一底部按钮） */}
      <div className="p-3 border-t border-border">
        <div className="mb-2 flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            {MODES[mode].name}
          </span>
        </div>

        <div className="bg-muted/30 border border-border rounded-lg p-2 focus-within:ring-1 focus-within:ring-primary/50 transition-all">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSendWithFiles}
            isLoading={status === "running"}
            isStreaming={status === "running"}
            onStop={abort}
            placeholder="输入任务指令... (@ 引用文件)"
            rows={3}
            hideSendButton={true}
          />
          <div className="flex items-center mt-2 gap-2">
            <div className="flex gap-2 items-center text-xs text-muted-foreground shrink-0">
              <span>@ 添加文件</span>
            </div>
            {/* 流式显示中间识别结果 */}
            <div className="flex-1 truncate text-sm text-foreground/70 italic">
              {interimText && <span className="animate-pulse">{interimText}...</span>}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleRecording}
                className={`p-1.5 rounded-md border flex items-center justify-center transition-colors relative ${isRecording
                    ? "bg-red-500/20 border-red-500 text-red-500"
                    : "bg-background border-border text-muted-foreground hover:bg-accent"
                  }`}
                title={isRecording ? "停止语音输入" : "开始语音输入"}
              >
                {isRecording && (
                  <span className="absolute inset-0 rounded-md animate-ping bg-red-500/30" />
                )}
                {isRecording ? <MicOff size={14} className="relative z-10" /> : <Mic size={14} />}
              </button>
              <button
                onClick={() => status === "running" ? abort() : handleSendWithFiles(input, [])}
                disabled={(!input.trim() && status !== "running")}
                className={`${status === "running"
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                  } disabled:opacity-50 rounded p-1.5 transition-colors flex items-center justify-center`}
                title={status === "running" ? "停止" : "发送"}
              >
                {status === "running" ? (
                  <Square size={14} fill="currentColor" />
                ) : (
                  <Send size={14} />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ 子组件 ============

function ModeSelector({ mode, onChange }: { mode: AgentModeSlug; onChange: (m: AgentModeSlug) => void }) {
  const [open, setOpen] = useState(false);
  const modes = getModeList();
  const current = MODES[mode];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 text-sm bg-muted rounded
                   hover:bg-muted/80 text-foreground"
      >
        <span>{current.name}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-40 bg-background border border-border 
                        rounded-lg shadow-lg z-10">
          {modes.map((m) => (
            <button
              key={m.slug}
              onClick={() => {
                onChange(m.slug);
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm hover:bg-muted
                         ${m.slug === mode ? "bg-muted text-primary" : "text-foreground"}`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolApproval({
  toolName,
  params,
  onApprove,
  onReject,
}: {
  toolName: string;
  params: Record<string, unknown>;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-2">
        <AlertCircle className="w-4 h-4" />
        <span className="font-medium">需要审批</span>
      </div>
      <div className="text-sm text-foreground mb-3">
        <p className="mb-1">
          工具: <code className="px-1 py-0.5 bg-muted rounded">{toolName}</code>
        </p>
        <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
          {JSON.stringify(params, null, 2)}
        </pre>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 
                     text-white text-sm rounded"
        >
          <Check className="w-3 h-3" />
          批准
        </button>
        <button
          onClick={onReject}
          className="flex items-center gap-1 px-3 py-1.5 bg-muted hover:bg-muted/80 
                     text-foreground text-sm rounded"
        >
          <X className="w-3 h-3" />
          拒绝
        </button>
      </div>
    </div>
  );
}

export default AgentPanel;
