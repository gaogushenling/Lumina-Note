/**
 * Slash Command 扩展
 * 输入 / 时弹出命令菜单
 */

import { EditorView, ViewPlugin, ViewUpdate, WidgetType, Decoration, DecorationSet } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";

// ============ 类型定义 ============

export interface SlashCommand {
  id: string;
  label: string;
  icon: string;
  description: string;
  category: "ai" | "heading" | "list" | "block" | "insert";
  action: (view: EditorView, from: number, to: number) => void;
}

// ============ 命令注册 ============

export const defaultCommands: SlashCommand[] = [
  // AI 命令
  {
    id: "ai-chat",
    label: "AI 对话",
    icon: "✨",
    description: "打开 AI 助手对话",
    category: "ai",
    action: (view, from, to) => {
      view.dispatch({ changes: { from, to, insert: "" } });
      window.dispatchEvent(new CustomEvent("open-ai-chat"));
    },
  },
  {
    id: "ai-continue",
    label: "AI 续写",
    icon: "🪄",
    description: "让 AI 继续写作",
    category: "ai",
    action: (view, from, to) => {
      view.dispatch({ changes: { from, to, insert: "" } });
      window.dispatchEvent(new CustomEvent("ai-continue-writing"));
    },
  },
  
  // 标题
  {
    id: "h1",
    label: "一级标题",
    icon: "H1",
    description: "大标题",
    category: "heading",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "# " },
        selection: { anchor: from + 2 }
      });
    },
  },
  {
    id: "h2",
    label: "二级标题",
    icon: "H2",
    description: "章节标题",
    category: "heading",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "## " },
        selection: { anchor: from + 3 }
      });
    },
  },
  {
    id: "h3",
    label: "三级标题",
    icon: "H3",
    description: "子章节",
    category: "heading",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "### " },
        selection: { anchor: from + 4 }
      });
    },
  },
  
  // 列表
  {
    id: "bullet-list",
    label: "无序列表",
    icon: "•",
    description: "项目符号列表",
    category: "list",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "- " },
        selection: { anchor: from + 2 }
      });
    },
  },
  {
    id: "numbered-list",
    label: "有序列表",
    icon: "1.",
    description: "编号列表",
    category: "list",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "1. " },
        selection: { anchor: from + 3 }
      });
    },
  },
  {
    id: "task-list",
    label: "任务列表",
    icon: "☐",
    description: "待办事项",
    category: "list",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "- [ ] " },
        selection: { anchor: from + 6 }
      });
    },
  },
  
  // 块
  {
    id: "quote",
    label: "引用",
    icon: "❝",
    description: "引用块",
    category: "block",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "> " },
        selection: { anchor: from + 2 }
      });
    },
  },
  {
    id: "code-block",
    label: "代码块",
    icon: "</>",
    description: "代码片段",
    category: "block",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "```\n\n```" },
        selection: { anchor: from + 4 }
      });
    },
  },
  {
    id: "callout",
    label: "Callout",
    icon: "💡",
    description: "提示框",
    category: "block",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "> [!note]\n> " },
        selection: { anchor: from + 12 }
      });
    },
  },
  {
    id: "math-block",
    label: "数学公式",
    icon: "∑",
    description: "LaTeX 公式块",
    category: "block",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "$$\n\n$$" },
        selection: { anchor: from + 3 }
      });
    },
  },
  
  // 插入
  {
    id: "table",
    label: "表格",
    icon: "▦",
    description: "Markdown 表格",
    category: "insert",
    action: (view, from, to) => {
      const table = "| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|  |  |  |";
      view.dispatch({ 
        changes: { from, to, insert: table },
        selection: { anchor: from + 2 }
      });
    },
  },
  {
    id: "divider",
    label: "分割线",
    icon: "—",
    description: "水平分割线",
    category: "insert",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "---\n" },
        selection: { anchor: from + 4 }
      });
    },
  },
  {
    id: "image",
    label: "图片",
    icon: "🖼",
    description: "插入图片",
    category: "insert",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "![]()" },
        selection: { anchor: from + 4 }
      });
    },
  },
  {
    id: "link",
    label: "链接",
    icon: "🔗",
    description: "插入链接",
    category: "insert",
    action: (view, from, to) => {
      view.dispatch({ 
        changes: { from, to, insert: "[]()" },
        selection: { anchor: from + 1 }
      });
    },
  },
];

// ============ State Effects ============

export const showSlashMenu = StateEffect.define<{ pos: number; filter: string }>();
export const hideSlashMenu = StateEffect.define<void>();
export const updateSlashFilter = StateEffect.define<string>();

interface SlashMenuState {
  active: boolean;
  pos: number;      // "/" 的位置
  filter: string;   // "/" 后面的过滤文本
}

export const slashMenuField = StateField.define<SlashMenuState>({
  create: () => ({ active: false, pos: 0, filter: "" }),
  update(state, tr) {
    for (const effect of tr.effects) {
      if (effect.is(showSlashMenu)) {
        return { active: true, pos: effect.value.pos, filter: effect.value.filter };
      }
      if (effect.is(hideSlashMenu)) {
        return { active: false, pos: 0, filter: "" };
      }
      if (effect.is(updateSlashFilter)) {
        return { ...state, filter: effect.value };
      }
    }
    
    // 文档变化时，检查是否应该关闭菜单
    if (state.active && tr.docChanged) {
      const head = tr.state.selection.main.head;
      // 如果光标不再在 "/" 之后，关闭菜单
      if (head <= state.pos) {
        return { active: false, pos: 0, filter: "" };
      }
      // 更新 filter
      const text = tr.state.doc.sliceString(state.pos, head);
      if (!text.startsWith("/")) {
        return { active: false, pos: 0, filter: "" };
      }
      return { ...state, filter: text.slice(1) };
    }
    
    return state;
  },
});

// ============ 输入处理 ============

export const slashCommandPlugin = ViewPlugin.fromClass(
  class {
    constructor(readonly view: EditorView) {}
    
    update(update: ViewUpdate) {
      // 检测是否输入了 "/"
      if (update.docChanged && !update.state.field(slashMenuField).active) {
        for (const tr of update.transactions) {
          tr.changes.iterChanges((_fromA, _toA, fromB, toB, inserted) => {
            const text = inserted.toString();
            if (text === "/" && fromB === toB - 1) {
              // 检查是否在行首或空格后
              const line = update.state.doc.lineAt(fromB);
              const before = update.state.doc.sliceString(line.from, fromB);
              if (before.trim() === "" || before.endsWith(" ")) {
                // 显示菜单
                setTimeout(() => {
                  this.view.dispatch({
                    effects: showSlashMenu.of({ pos: fromB, filter: "" })
                  });
                  // 通知 React 组件
                  const coords = this.view.coordsAtPos(fromB);
                  if (coords) {
                    window.dispatchEvent(new CustomEvent("slash-menu-show", {
                      detail: { x: coords.left, y: coords.bottom, pos: fromB }
                    }));
                  }
                }, 0);
              }
            }
          });
        }
      }
    }
  }
);

// ============ 占位符 ============

class PlaceholderWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-placeholder";
    span.textContent = this.text;
    span.style.cssText = `
      color: hsl(var(--muted-foreground) / 0.5);
      pointer-events: none;
      position: absolute;
      left: 16px;
      font-style: italic;
    `;
    return span;
  }
  
  ignoreEvent() { return true; }
}

export function placeholderExtension(text: string) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      
      update(update: ViewUpdate) {
        if (update.docChanged || update.focusChanged) {
          this.decorations = this.build(update.view);
        }
      }
      
      build(view: EditorView): DecorationSet {
        const doc = view.state.doc;
        // 只在文档为空时显示
        if (doc.length === 0 || (doc.length === 1 && doc.toString() === "")) {
          return Decoration.set([
            Decoration.widget({
              widget: new PlaceholderWidget(text),
              side: 1,
            }).range(0)
          ]);
        }
        return Decoration.none;
      }
    },
    { decorations: v => v.decorations }
  );
}

// ============ 导出 ============

export const slashCommandExtensions = [
  slashMenuField,
  slashCommandPlugin,
];
