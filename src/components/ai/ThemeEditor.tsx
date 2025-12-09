/**
 * 主题编辑器组件
 * 允许用户可视化创建和编辑自定义主题
 */

import { useState, useEffect, useCallback } from 'react';
import { X, Save, Copy, Download, Upload, Palette, Sun, Moon } from 'lucide-react';
import { Theme, ThemeColors, OFFICIAL_THEMES } from '@/lib/themes';
import {
  createThemeTemplate,
  exportTheme,
  importTheme,
  saveUserTheme,
  applyTheme
} from '@/lib/themePlugin';
import { useUIStore } from '@/stores/useUIStore';
import { useFileStore } from '@/stores/useFileStore';
import { useLocaleStore } from '@/stores/useLocaleStore';

interface ThemeEditorProps {
  isOpen: boolean;
  onClose: () => void;
  editingTheme?: Theme;
  onSave?: (theme: Theme) => void;
}

// 颜色分组配置 - will be localized dynamically
const COLOR_GROUP_KEYS = [
  {
    nameKey: 'baseUI',
    keys: ['background', 'foreground', 'muted', 'mutedForeground', 'accent', 'accentForeground', 'primary', 'primaryForeground', 'border']
  },
  {
    nameKey: 'markdownText',
    keys: ['heading', 'link', 'linkHover', 'bold', 'italic', 'blockquote', 'blockquoteBorder', 'listMarker', 'tag', 'highlight']
  },
  {
    nameKey: 'code',
    keys: ['code', 'codeBg', 'codeBlock', 'codeBlockBg']
  },
  {
    nameKey: 'tableAndDivider',
    keys: ['hr', 'tableBorder', 'tableHeaderBg']
  },
  {
    nameKey: 'diffCompare',
    keys: ['diffAddBg', 'diffAddText', 'diffRemoveBg', 'diffRemoveText']
  }
];

// 颜色键的中文名称
const COLOR_LABELS: Record<string, string> = {
  background: '背景',
  foreground: '前景文字',
  muted: '次要背景',
  mutedForeground: '次要文字',
  accent: '强调背景',
  accentForeground: '强调文字',
  primary: '主色',
  primaryForeground: '主色文字',
  border: '边框',
  heading: '标题',
  link: '链接',
  linkHover: '链接悬浮',
  code: '行内代码',
  codeBg: '行内代码背景',
  codeBlock: '代码块文字',
  codeBlockBg: '代码块背景',
  blockquote: '引用文字',
  blockquoteBorder: '引用边框',
  hr: '分割线',
  tableBorder: '表格边框',
  tableHeaderBg: '表头背景',
  bold: '粗体',
  italic: '斜体',
  listMarker: '列表标记',
  highlight: '高亮背景',
  tag: '标签',
  diffAddBg: '新增背景',
  diffAddText: '新增文字',
  diffRemoveBg: '删除背景',
  diffRemoveText: '删除文字'
};

// HSL 字符串转换为 CSS hsl() 格式
function hslToCSS(hsl: string): string {
  return `hsl(${hsl})`;
}

// HSL 字符串解析
function parseHSL(hsl: string): { h: number; s: number; l: number } {
  const parts = hsl.split(' ').map(p => parseFloat(p));
  return { h: parts[0] || 0, s: parts[1] || 0, l: parts[2] || 0 };
}

// 构建 HSL 字符串
function buildHSL(h: number, s: number, l: number): string {
  return `${h} ${s}% ${l}%`;
}

export function ThemeEditor({ isOpen, onClose, editingTheme, onSave }: ThemeEditorProps) {
  const { isDarkMode } = useUIStore();
  const { vaultPath } = useFileStore();
  const { t } = useLocaleStore();
  
  const [theme, setTheme] = useState<Theme>(() => 
    editingTheme || createThemeTemplate()
  );
  const [previewMode, setPreviewMode] = useState<'light' | 'dark'>(isDarkMode ? 'dark' : 'light');
  const [activeGroup, setActiveGroup] = useState(0);
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);

  // 当 editingTheme 变化时更新
  useEffect(() => {
    if (editingTheme) {
      setTheme(editingTheme);
    }
  }, [editingTheme]);

  // 实时预览主题
  useEffect(() => {
    if (isOpen) {
      applyTheme(theme, previewMode === 'dark');
    }
  }, [theme, previewMode, isOpen]);


  // 更新 HSL 分量
  const updateHSLComponent = useCallback((
    mode: 'light' | 'dark',
    key: keyof ThemeColors,
    component: 'h' | 's' | 'l',
    value: number
  ) => {
    setTheme(prev => {
      const current = parseHSL(prev[mode][key]);
      current[component] = value;
      return {
        ...prev,
        [mode]: {
          ...prev[mode],
          [key]: buildHSL(current.h, current.s, current.l)
        }
      };
    });
  }, []);

  // 保存主题
  const handleSave = async () => {
    if (!vaultPath) {
      alert(t.themeEditor.openVaultFirst);
      return;
    }
    
    const success = await saveUserTheme(vaultPath, theme);
    if (success) {
      onSave?.(theme);
      onClose();
    } else {
      alert(t.themeEditor.saveFailed);
    }
  };

  // 导出主题
  const handleExport = () => {
    const json = exportTheme(theme);
    navigator.clipboard.writeText(json);
    alert(t.themeEditor.themeCopied);
  };

  // 下载主题文件
  const handleDownload = () => {
    const json = exportTheme(theme);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${theme.id.replace('user-', '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导入主题
  const handleImport = () => {
    const imported = importTheme(importText);
    if (imported) {
      setTheme(imported);
      setShowImport(false);
      setImportText('');
    } else {
      alert(t.themeEditor.invalidThemeJson);
    }
  };

  // 基于官方主题重置
  const handleReset = (baseTheme: Theme) => {
    setTheme({
      ...theme,
      light: { ...baseTheme.light },
      dark: { ...baseTheme.dark }
    });
  };

  if (!isOpen) return null;

  const currentColors = theme[previewMode];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-lg shadow-xl w-[900px] max-h-[85vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 text-primary" />
            <span className="font-medium">{t.themeEditor.title}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* 预览模式切换 */}
            <button
              onClick={() => setPreviewMode(previewMode === 'light' ? 'dark' : 'light')}
              className="p-2 rounded hover:bg-accent transition-colors"
              title={previewMode === 'light' ? t.themeEditor.switchToDark : t.themeEditor.switchToLight}
            >
              {previewMode === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button onClick={onClose} className="p-2 rounded hover:bg-accent transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 主体 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧：基本信息和颜色分组 */}
          <div className="w-64 border-r border-border p-4 overflow-y-auto">
            {/* 主题信息 */}
            <div className="space-y-3 mb-6">
              <div>
                <label className="text-xs text-muted-foreground">{t.themeEditor.themeName}</label>
                <input
                  type="text"
                  value={theme.name}
                  onChange={e => setTheme(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 text-sm bg-muted border border-border rounded"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t.themeEditor.description}</label>
                <input
                  type="text"
                  value={theme.description}
                  onChange={e => setTheme(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full mt-1 px-2 py-1.5 text-sm bg-muted border border-border rounded"
                />
              </div>
            </div>

            {/* 颜色分组 */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground mb-2">{t.themeEditor.colorGroups}</div>
              {COLOR_GROUP_KEYS.map((group, idx) => (
                <button
                  key={group.nameKey}
                  onClick={() => setActiveGroup(idx)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                    activeGroup === idx
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  }`}
                >
                  {t.themeEditor[group.nameKey as keyof typeof t.themeEditor] || group.nameKey}
                </button>
              ))}
            </div>

            {/* 基于官方主题 */}
            <div className="mt-6">
              <div className="text-xs text-muted-foreground mb-2">{t.themeEditor.basedOnTheme}</div>
              <select
                onChange={e => {
                  const base = OFFICIAL_THEMES.find(t => t.id === e.target.value);
                  if (base) handleReset(base);
                }}
                className="w-full px-2 py-1.5 text-sm bg-muted border border-border rounded"
              >
                <option value="">{t.themeEditor.selectBaseTheme}</option>
                {OFFICIAL_THEMES.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 右侧：颜色编辑器 */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
              {COLOR_GROUP_KEYS[activeGroup].keys.map(key => {
                const colorKey = key as keyof ThemeColors;
                const hsl = parseHSL(currentColors[colorKey]);
                
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{t.themeEditor[key as keyof typeof t.themeEditor] || key}</span>
                      <div
                        className="w-6 h-6 rounded border border-border"
                        style={{ backgroundColor: hslToCSS(currentColors[colorKey]) }}
                      />
                    </div>
                    
                    {/* H - 色相 */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6">H</span>
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={hsl.h}
                        onChange={e => updateHSLComponent(previewMode, colorKey, 'h', Number(e.target.value))}
                        className="flex-1 h-1.5 accent-primary"
                      />
                      <span className="text-xs w-8 text-right">{Math.round(hsl.h)}</span>
                    </div>
                    
                    {/* S - 饱和度 */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6">S</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={hsl.s}
                        onChange={e => updateHSLComponent(previewMode, colorKey, 's', Number(e.target.value))}
                        className="flex-1 h-1.5 accent-primary"
                      />
                      <span className="text-xs w-8 text-right">{Math.round(hsl.s)}%</span>
                    </div>
                    
                    {/* L - 亮度 */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-6">L</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={hsl.l}
                        onChange={e => updateHSLComponent(previewMode, colorKey, 'l', Number(e.target.value))}
                        className="flex-1 h-1.5 accent-primary"
                      />
                      <span className="text-xs w-8 text-right">{Math.round(hsl.l)}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(!showImport)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors"
            >
              <Upload size={14} />
              {t.themeEditor.import}
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors"
            >
              <Copy size={14} />
              {t.themeEditor.copyJson}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded hover:bg-accent transition-colors"
            >
              <Download size={14} />
              {t.themeEditor.download}
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm rounded hover:bg-accent transition-colors"
            >
              {t.themeEditor.cancel}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
            >
              <Save size={14} />
              {t.themeEditor.saveToVault}
            </button>
          </div>
        </div>

        {/* 导入面板 */}
        {showImport && (
          <div className="absolute bottom-16 left-4 w-80 p-3 bg-background border border-border rounded-lg shadow-lg">
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={t.themeEditor.pasteThemeJson}
              className="w-full h-32 p-2 text-sm bg-muted border border-border rounded resize-none"
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setShowImport(false)}
                className="px-3 py-1 text-sm rounded hover:bg-accent"
              >
                {t.themeEditor.cancel}
              </button>
              <button
                onClick={handleImport}
                className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded"
              >
                {t.themeEditor.import}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
