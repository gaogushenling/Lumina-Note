# PDF 阅读器与批注功能设计文档

## 概述

实现 PDF 文件的阅读和批注功能，与视频笔记类似，通过 TabBar 管理标签页生命周期。

## 设计原则

### TabBar 统一管理

所有新功能视图必须遵循以下原则：

1. **标签页类型** - 在 `useFileStore.ts` 的 `TabType` 中注册
2. **生命周期** - 通过 TabBar 的关闭按钮控制
3. **状态切换** - 切换标签页时正确处理显示/隐藏
4. **持久化** - 根据需要决定是否持久化标签页状态

### 现有 TabType

```typescript
type TabType = "file" | "graph" | "video-note" | "pdf"; // 新增 pdf
```

## 架构设计

### 1. 类型定义

```typescript
// src/types/pdfNote.ts

export interface PdfAnnotation {
  id: string;
  page: number;           // 页码
  type: 'highlight' | 'underline' | 'note' | 'drawing';
  content?: string;       // 批注内容
  color: string;          // 颜色
  position: {             // 位置信息
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  selectedText?: string;  // 选中的文本
  createdAt: string;
}

export interface PdfNoteFile {
  version: 1;
  pdf: {
    path: string;         // PDF 文件路径
    name: string;         // 文件名
    totalPages: number;   // 总页数
  };
  currentPage: number;    // 当前阅读页
  zoom: number;           // 缩放比例
  annotations: PdfAnnotation[];
  createdAt: string;
  updatedAt: string;
}
```

### 2. 标签页扩展

```typescript
// src/stores/useFileStore.ts

interface Tab {
  // ... 现有字段
  type: TabType;
  pdfPath?: string;  // PDF 文件路径（type === "pdf" 时）
}

// 新增方法
openPdfTab: (path: string) => void;
```

### 3. 组件结构

```
src/components/
├── PdfReaderView.tsx      # PDF 阅读器主组件
├── PdfToolbar.tsx         # 工具栏（翻页、缩放、批注工具）
├── PdfAnnotationPanel.tsx # 批注面板（侧边栏）
└── PdfPageView.tsx        # 单页渲染
```

## 实现步骤

### Phase 1: 基础 PDF 渲染

1. **添加依赖**
   - 使用 `pdfjs-dist` 或 `react-pdf` 渲染 PDF
   - 考虑使用 `pdf-lib` 进行 PDF 操作

2. **创建 PdfReaderView 组件**
   ```typescript
   interface PdfReaderViewProps {
     pdfPath: string;
     isActive: boolean;
   }
   ```

3. **注册标签页类型**
   - 在 `TabType` 中添加 `"pdf"`
   - 在 `TabBar` 中添加 PDF 图标
   - 实现 `openPdfTab` 方法

4. **App.tsx 集成**
   ```typescript
   {activeTab?.type === "pdf" && activeTab.pdfPath && (
     <PdfReaderView
       pdfPath={activeTab.pdfPath}
       isActive={true}
     />
   )}
   ```

### Phase 2: 批注功能

1. **高亮标注**
   - 选中文本后高亮
   - 支持多种颜色

2. **笔记批注**
   - 点击添加笔记图标
   - 弹出输入框
   - 保存到批注列表

3. **绘图批注**
   - 自由绘制
   - 矩形/圆形标注

### Phase 3: 批注管理

1. **侧边栏显示所有批注**
2. **点击跳转到对应位置**
3. **导出批注为 Markdown**
4. **批注搜索**

### Phase 4: 高级功能

1. **PDF 内文本搜索**
2. **目录导航（如果 PDF 有目录）**
3. **书签功能**
4. **阅读进度同步**

## 文件存储

批注文件存储在 `LocalData/pdf-notes/` 目录：

```
{vaultPath}/
└── LocalData/
    └── pdf-notes/
        └── {pdf-filename}.annotations.json
```

## Ribbon 按钮

在 Ribbon 中添加 PDF 按钮：

```typescript
{/* PDF Reader */}
<button
  onClick={() => {
    const pdfTabIndex = tabs.findIndex(t => t.type === "pdf");
    if (pdfTabIndex >= 0) {
      switchTab(pdfTabIndex);
    } else {
      // 打开文件选择器选择 PDF
      openPdfPicker();
    }
  }}
  className={cn(
    "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
    isPdfActive
      ? "bg-primary/10 text-primary"
      : "text-muted-foreground hover:text-foreground hover:bg-muted"
  )}
  title="PDF 阅读器"
>
  <FileText size={20} />
</button>
```

## 与视频笔记的对比

| 功能 | 视频笔记 | PDF 阅读器 |
|------|----------|------------|
| 标签页类型 | `video-note` | `pdf` |
| 内容源 | B站视频 URL | 本地 PDF 文件 |
| 时间戳 | 视频时间 | 页码 |
| 截图 | WebView 截图 | 页面区域截图 |
| 批注存储 | `.videonote.md` | `.annotations.json` |

## 推荐技术栈

1. **PDF 渲染**: `react-pdf` (基于 pdf.js)
2. **批注绘制**: `fabric.js` 或 Canvas API
3. **PDF 操作**: `pdf-lib` (如需修改 PDF)

## 注意事项

1. **大文件处理** - PDF 可能很大，需要懒加载页面
2. **内存管理** - 及时释放不可见页面的渲染资源
3. **批注同步** - 确保批注正确保存，避免丢失
4. **跨平台兼容** - 测试 Windows/Mac/Linux 的路径处理

## 开发优先级

1. ⭐⭐⭐ 基础 PDF 渲染和翻页
2. ⭐⭐⭐ TabBar 集成
3. ⭐⭐ 高亮批注
4. ⭐⭐ 笔记批注
5. ⭐ 绘图批注
6. ⭐ 导出功能
