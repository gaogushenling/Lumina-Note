/**
 * 设置面板
 * 在屏幕中央显示的模态框
 */

import { useUIStore } from "@/stores/useUIStore";
import { useAIStore } from "@/stores/useAIStore";
import { OFFICIAL_THEMES } from "@/lib/themes";
import { X, Check } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { themeId, setThemeId, editorMode, setEditorMode } = useUIStore();
  const { config } = useAIStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 设置面板 */}
      <div className="relative w-[600px] max-h-[80vh] bg-background border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">设置</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        {/* 设置内容 */}
        <div className="p-6 space-y-8 overflow-y-auto max-h-[calc(80vh-60px)]">
          {/* 主题设置 */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              主题
            </h3>
            <p className="text-sm text-muted-foreground">选择界面配色方案，每套主题自动适配浅色/深色模式</p>
            
            {/* 主题网格 */}
            <div className="grid grid-cols-3 gap-3">
              {OFFICIAL_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => setThemeId(theme.id)}
                  className={`relative p-3 rounded-lg border-2 transition-all text-left ${
                    themeId === theme.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  }`}
                >
                  {/* 颜色预览 */}
                  <div className="flex gap-1 mb-2">
                    <div 
                      className="w-4 h-4 rounded-full border border-border"
                      style={{ backgroundColor: `hsl(${theme.light.primary})` }}
                    />
                    <div 
                      className="w-4 h-4 rounded-full border border-border"
                      style={{ backgroundColor: `hsl(${theme.dark.primary})` }}
                    />
                  </div>
                  
                  {/* 主题名称 */}
                  <p className="font-medium text-sm">{theme.name}</p>
                  <p className="text-xs text-muted-foreground">{theme.description}</p>
                  
                  {/* 选中标记 */}
                  {themeId === theme.id && (
                    <div className="absolute top-2 right-2">
                      <Check size={16} className="text-primary" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>

          {/* 编辑器设置 */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              编辑器
            </h3>
            
            {/* 编辑模式 */}
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">默认编辑模式</p>
                <p className="text-sm text-muted-foreground">打开文件时的默认视图</p>
              </div>
              <select
                value={editorMode}
                onChange={(e) => setEditorMode(e.target.value as any)}
                className="px-3 py-1.5 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="live">实时预览</option>
                <option value="source">源码模式</option>
                <option value="reading">阅读模式</option>
              </select>
            </div>
          </section>

          {/* AI 设置预览 */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              AI 助手
            </h3>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">当前模型</p>
                <p className="text-sm text-muted-foreground">在右侧面板中配置更多选项</p>
              </div>
              <span className="text-sm text-muted-foreground bg-muted px-3 py-1.5 rounded-md">
                {config.model || "未配置"}
              </span>
            </div>
          </section>

          {/* 关于 */}
          <section className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              关于
            </h3>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Lumina Note</p>
                <p className="text-sm text-muted-foreground">本地优先的 AI 驱动笔记应用</p>
              </div>
              <span className="text-sm text-muted-foreground">
                v0.1.0
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
