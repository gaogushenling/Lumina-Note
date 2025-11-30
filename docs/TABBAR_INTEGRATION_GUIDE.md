# TabBar 功能集成开发指南

## 概述

本文档描述如何将新功能集成到 TabBar 标签页系统中。所有新功能视图都必须通过 TabBar 管理其生命周期。

## 核心文件

| 文件 | 用途 |
|------|------|
| `src/stores/useFileStore.ts` | 标签页状态管理、类型定义 |
| `src/components/TabBar.tsx` | 标签页 UI 渲染 |
| `src/components/Ribbon.tsx` | 侧边栏快捷按钮 |
| `src/App.tsx` | 根据标签页类型渲染对应视图 |

## 集成步骤

### Step 1: 定义标签页类型

在 `useFileStore.ts` 中扩展 `TabType`：

```typescript
// src/stores/useFileStore.ts

type TabType = "file" | "graph" | "video-note" | "pdf" | "your-new-type";

interface Tab {
  id: string;
  type: TabType;
  name: string;
  path: string;
  // 添加你的功能所需字段
  yourCustomField?: string;
}
```

### Step 2: 添加打开标签页方法

```typescript
// src/stores/useFileStore.ts

openYourFeatureTab: (param: string) => {
  const { tabs, activeTabIndex } = get();
  
  // 检查是否已存在（单例模式，可选）
  const existingIndex = tabs.findIndex(t => t.type === "your-new-type");
  if (existingIndex >= 0) {
    // 更新现有标签页并切换
    const updatedTabs = [...tabs];
    updatedTabs[existingIndex] = {
      ...updatedTabs[existingIndex],
      yourCustomField: param,
    };
    set({ tabs: updatedTabs, activeTabIndex: existingIndex });
    return;
  }
  
  // 创建新标签页
  const newTab: Tab = {
    id: `your-feature-${Date.now()}`,
    type: "your-new-type",
    name: "功能名称",
    path: "",
    yourCustomField: param,
  };
  
  set({
    tabs: [...tabs, newTab],
    activeTabIndex: tabs.length,
  });
}
```

### Step 3: 添加标签页图标

```typescript
// src/components/TabBar.tsx

import { YourIcon } from "lucide-react";

// 在渲染标签页图标的地方添加
{tab.type === "your-new-type" && <YourIcon size={14} />}
```

### Step 4: 处理关闭逻辑（如需清理资源）

```typescript
// src/components/TabBar.tsx

const handleCloseTab = async (index: number, e: React.MouseEvent) => {
  e.stopPropagation();
  
  const tab = tabs[index];
  
  // 如果是你的功能类型，执行清理
  if (tab.type === "your-new-type") {
    await invoke('cleanup_your_feature');
  }
  
  closeTab(index);
};
```

### Step 5: 在 App.tsx 中渲染视图

```typescript
// src/App.tsx

import { YourFeatureView } from "@/components/YourFeatureView";

// 在 EditorWithGraph 组件中
{activeTab?.type === "your-new-type" && (
  <YourFeatureView
    customField={activeTab.yourCustomField}
    isActive={true}
  />
)}
```

### Step 6: 添加 Ribbon 按钮（可选）

```typescript
// src/components/Ribbon.tsx

const isYourFeatureActive = activeTab?.type === "your-new-type";

<button
  onClick={() => {
    const tabIndex = tabs.findIndex(t => t.type === "your-new-type");
    if (tabIndex >= 0) {
      switchTab(tabIndex);
    } else {
      openYourFeatureTab("default-param");
    }
  }}
  className={cn(
    "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
    isYourFeatureActive
      ? "bg-primary/10 text-primary"
      : "text-muted-foreground hover:text-foreground hover:bg-muted"
  )}
  title="你的功能"
>
  <YourIcon size={20} />
</button>
```

## 功能视图组件模板

```typescript
// src/components/YourFeatureView.tsx

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useFileStore } from '@/stores/useFileStore';

interface YourFeatureViewProps {
  customField?: string;
  isActive?: boolean;
}

export function YourFeatureView({ customField, isActive = true }: YourFeatureViewProps) {
  const { vaultPath } = useFileStore();
  
  // 根据 isActive 控制资源（如 WebView）
  useEffect(() => {
    if (isActive) {
      // 激活时的逻辑
    } else {
      // 切换到其他标签页时的逻辑
    }
  }, [isActive]);
  
  // 组件卸载时清理
  useEffect(() => {
    return () => {
      // 清理资源
    };
  }, []);
  
  return (
    <div className="flex-1 flex flex-col h-full">
      {/* 工具栏 */}
      <div className="h-12 border-b flex items-center px-4">
        <h2>功能标题</h2>
      </div>
      
      {/* 主内容区 */}
      <div className="flex-1 overflow-auto">
        {/* 你的功能内容 */}
      </div>
    </div>
  );
}
```

## 已注册的标签页类型

| 类型 | 用途 | 图标 | 单例 |
|------|------|------|------|
| `file` | 文件编辑 | File | 否 |
| `graph` | 关系图谱 | Network | 是 |
| `video-note` | 视频笔记 | Video | 是 |
| `pdf` | PDF 阅读器 | FileText | 待实现 |

## 最佳实践

1. **单例模式** - 对于全局功能（如图谱、视频笔记），只允许一个标签页实例
2. **资源管理** - 使用 `isActive` prop 控制资源的显示/隐藏，避免重复创建
3. **清理逻辑** - 在 TabBar 关闭时正确清理资源（WebView、定时器等）
4. **持久化** - 在 `useFileStore` 的 `partialize` 中决定是否持久化
5. **图标一致性** - 使用 lucide-react 图标库保持风格统一

## 持久化配置

```typescript
// src/stores/useFileStore.ts

{
  name: "lumina-workspace",
  partialize: (state) => ({
    vaultPath: state.vaultPath,
    recentFiles: state.recentFiles,
    // 不要持久化特定功能的标签页（如视频笔记）
    // 如需持久化，在此添加
  }),
}
```

## 常见问题

### Q: 切换标签页时组件重新渲染？
使用 `isActive` prop 控制显示/隐藏，而不是条件渲染整个组件。

### Q: 如何保持功能状态？
将状态保存在标签页对象中，或创建独立的 store。

### Q: 如何处理 WebView？
参考 `VideoNoteView.tsx` 的实现，使用 `set_webview_visible` 控制显示。
