/**
 * 浏览器视图组件
 * 使用 Tauri WebView 显示网页内容
 * 
 * 技术方案：
 * - 使用 Tauri 的 add_child WebView 创建独立的浏览器实例
 * - 不受 X-Frame-Options 限制（因为不是 iframe）
 * - 支持访问 Google、GitHub 等所有网站
 * - 在 Windows 上使用 WebView2（基于 Chromium）
 * 
 * 标签页生命周期管理（Chrome 风格）：
 * - Active: 当前激活的标签页，WebView 可见
 * - Background: 后台标签页，WebView 隐藏但保持活跃
 * - Frozen: 冻结的标签页，JS 暂停但 DOM 保留
 * - Discarded: 已丢弃的标签页，WebView 已销毁，只保留 URL
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Globe, Bookmark, Share2, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { AddressBar } from './AddressBar';
import { useFileStore } from '@/stores/useFileStore';
import { useBrowserStore } from '@/stores/useBrowserStore';
import { cn } from '@/lib/utils';

interface BrowserViewProps {
  tabId: string;
  initialUrl?: string;
  isActive?: boolean;
  onTitleChange?: (title: string) => void;
}

// 默认首页
const DEFAULT_HOME_URL = 'https://www.bing.com';

export function BrowserView({
  tabId,
  initialUrl = '',
  isActive = true,
  onTitleChange,
}: BrowserViewProps) {
  const { updateWebpageTab } = useFileStore();
  const {
    registerWebView,
    updateUrl,
    updateTitle,
    startLifecycleManager,
  } = useBrowserStore();
  
  // 状态 - 使用 tabId 作为 key 来跟踪当前标签页的状态
  const [currentUrl, setCurrentUrl] = useState(initialUrl || '');
  const [isLoading, setIsLoading] = useState(false);
  const [webviewCreated, setWebviewCreated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 跟踪上一个 tabId，用于在切换时隐藏旧的 WebView
  const prevTabIdRef = useRef<string | null>(null);
  
  // 容器引用
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 启动生命周期管理器（只在首次挂载时）
  useEffect(() => {
    startLifecycleManager();
  }, [startLifecycleManager]);

  
  // 当 tabId 变化时，处理标签页切换
  useEffect(() => {
    const handleTabSwitch = async () => {
      const prevTabId = prevTabIdRef.current;
      
      // 如果 tabId 变化了，需要切换 WebView
      if (prevTabId && prevTabId !== tabId) {
        console.log('[Browser] 标签页切换:', prevTabId, '->', tabId);
        
        // 隐藏旧的 WebView
        try {
          await invoke('set_browser_webview_visible', { tabId: prevTabId, visible: false });
          console.log('[Browser] 隐藏旧 WebView:', prevTabId);
        } catch (err) {
          console.error('[Browser] 隐藏旧 WebView 失败:', err);
        }
        
        // 重置组件状态，准备显示新标签页
        setCurrentUrl(initialUrl || '');
        setError(null);
        setIsLoading(false);
        
        // 检查新标签页的 WebView 是否存在
        try {
          const exists = await invoke<boolean>('browser_webview_exists', { tabId });
          setWebviewCreated(exists);
          
          if (exists) {
            // WebView 已存在，显示它
            await invoke('set_browser_webview_visible', { tabId, visible: true });
            // 更新位置
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              await invoke('update_browser_webview_bounds', {
                tabId,
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height,
              });
            }
            console.log('[Browser] 显示已存在的 WebView:', tabId);
          }
        } catch (err) {
          console.error('[Browser] 检查 WebView 失败:', err);
          setWebviewCreated(false);
        }
      }
      
      prevTabIdRef.current = tabId;
    };
    
    handleTabSwitch();
  }, [tabId, initialUrl]);
  
  // 创建浏览器视图（使用 Tauri WebView，不是 iframe）
  const createWebview = useCallback(async (url: string) => {
    if (!url) return;
    
    // 确保容器已渲染
    if (!containerRef.current) {
      console.warn('[Browser] 容器未准备好，延迟创建 WebView');
      setTimeout(() => createWebview(url), 100);
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      const rect = containerRef.current.getBoundingClientRect();
      
      // 确保容器有有效尺寸
      if (rect.width <= 0 || rect.height <= 0) {
        console.warn('[Browser] 容器尺寸无效，延迟创建 WebView');
        setTimeout(() => createWebview(url), 100);
        return;
      }
      
      // 检查 WebView 是否已存在
      const exists = await invoke<boolean>('browser_webview_exists', { tabId });
      
      if (!exists) {
        // 创建新的 WebView
        await invoke('create_browser_webview', {
          tabId,
          url,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
        console.log('[Browser] WebView 创建成功:', tabId, url);
      } else {
        // WebView 已存在，显示并更新位置
        await invoke('set_browser_webview_visible', { tabId, visible: true });
        await invoke('update_browser_webview_bounds', {
          tabId,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
        });
        console.log('[Browser] WebView 已存在，显示并更新位置:', tabId);
      }
      
      setWebviewCreated(true);
      setCurrentUrl(url);
      
      // 注册到 store
      registerWebView(tabId, url);
      
      // 更新标签页信息
      try {
        const urlObj = new URL(url);
        const title = urlObj.hostname;
        updateWebpageTab(tabId, url, title);
        updateTitle(tabId, title);
        onTitleChange?.(title);
      } catch {
        // URL 解析失败
      }
    } catch (err) {
      console.error('[Browser] WebView 创建失败:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [tabId, registerWebView, updateWebpageTab, updateTitle, onTitleChange]);
  
  // 更新 WebView 浏览器位置大小
  const updateWebviewBounds = useCallback(async () => {
    if (!webviewCreated || !containerRef.current) return;
    
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    
    try {
      await invoke('update_browser_webview_bounds', {
        tabId,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    } catch (err) {
      console.error('[Browser] 更新 WebView 位置失败:', err);
    }
  }, [tabId, webviewCreated]);

  
  // 导航到新 URL
  const handleNavigate = useCallback(async (url: string) => {
    if (!url) return;
    
    setCurrentUrl(url);
    setIsLoading(true);
    
    try {
      if (webviewCreated) {
        await invoke('navigate_browser_webview', { tabId, url });
      } else {
        await createWebview(url);
      }
      
      // 更新 store 和标签页信息
      updateUrl(tabId, url);
      try {
        const urlObj = new URL(url);
        const title = urlObj.hostname;
        updateWebpageTab(tabId, url, title);
        updateTitle(tabId, title);
        onTitleChange?.(title);
      } catch {
        // URL 解析失败
      }
    } catch (err) {
      console.error('[Browser] 导航失败:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [tabId, webviewCreated, createWebview, updateUrl, updateWebpageTab, updateTitle, onTitleChange]);
  
  // 后退
  const handleBack = useCallback(async () => {
    if (!webviewCreated) return;
    try {
      await invoke('browser_webview_go_back', { tabId });
    } catch (err) {
      console.error('[Browser] 后退失败:', err);
    }
  }, [tabId, webviewCreated]);
  
  // 前进
  const handleForward = useCallback(async () => {
    if (!webviewCreated) return;
    try {
      await invoke('browser_webview_go_forward', { tabId });
    } catch (err) {
      console.error('[Browser] 前进失败:', err);
    }
  }, [tabId, webviewCreated]);
  
  // 刷新
  const handleRefresh = useCallback(async () => {
    try {
      setIsLoading(true);
      await invoke('browser_webview_reload', { tabId });
    } catch (err) {
      console.error('[Browser] 刷新失败:', err);
    } finally {
      setTimeout(() => setIsLoading(false), 500);
    }
  }, [tabId]);
  
  // 主页
  const handleHome = useCallback(() => {
    handleNavigate(DEFAULT_HOME_URL);
  }, [handleNavigate]);
  
  // 初始化：如果有初始 URL 且 WebView 未创建，创建 WebView
  useEffect(() => {
    if (initialUrl && !webviewCreated && isActive) {
      // 检查是否已经有 WebView 存在
      invoke<boolean>('browser_webview_exists', { tabId }).then(exists => {
        if (exists) {
          // WebView 已存在，只需要显示
          setWebviewCreated(true);
          setCurrentUrl(initialUrl);
          invoke('set_browser_webview_visible', { tabId, visible: true });
          updateWebviewBounds();
        } else {
          // 创建新 WebView
          createWebview(initialUrl);
        }
      });
    }
  }, [tabId, initialUrl, webviewCreated, isActive, createWebview, updateWebviewBounds]);
  
  // 监听窗口大小变化
  useEffect(() => {
    if (!webviewCreated) return;
    
    const handleResize = () => updateWebviewBounds();
    window.addEventListener('resize', handleResize);
    
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [webviewCreated, updateWebviewBounds]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* 地址栏 */}
      <AddressBar
        url={currentUrl}
        onNavigate={handleNavigate}
        onBack={handleBack}
        onForward={handleForward}
        onRefresh={handleRefresh}
        onHome={handleHome}
        canGoBack={webviewCreated}
        canGoForward={webviewCreated}
        isLoading={isLoading}
      />
      
      {/* 工具栏 */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-muted/30">
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title="添加书签"
        >
          <Bookmark size={14} />
        </button>
        <button
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title="分享"
        >
          <Share2 size={14} />
        </button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {isLoading ? '加载中...' : ''}
        </span>
      </div>
      
      {/* WebView 容器 */}
      <div 
        ref={containerRef}
        className="flex-1 relative bg-white overflow-hidden"
      >
        {/* 错误提示 */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="text-center p-8">
              <AlertCircle className="w-16 h-16 mx-auto text-red-500 mb-4" />
              <h3 className="text-lg font-medium mb-2">加载出错</h3>
              <p className="text-sm text-muted-foreground mb-4">{error}</p>
              <button
                onClick={() => handleNavigate(currentUrl)}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
              >
                重试
              </button>
            </div>
          </div>
        )}
        
        {/* 空状态（未输入 URL） */}
        {!currentUrl && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-background to-muted/20 z-5">
            <div className="text-center p-8 max-w-md">
              <Globe className="w-20 h-20 mx-auto text-muted-foreground/50 mb-6" />
              <h2 className="text-xl font-medium mb-2">开始浏览</h2>
              <p className="text-sm text-muted-foreground mb-6">
                在地址栏输入网址或搜索关键词
              </p>
              
              {/* 快捷入口 */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { name: '必应', url: 'https://www.bing.com', color: 'bg-blue-500' },
                  { name: 'Wikipedia', url: 'https://www.wikipedia.org', color: 'bg-orange-500' },
                  { name: 'MDN', url: 'https://developer.mozilla.org', color: 'bg-black' },
                ].map(site => (
                  <button
                    key={site.url}
                    onClick={() => handleNavigate(site.url)}
                    className="p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white",
                      site.color
                    )}>
                      <Globe size={20} />
                    </div>
                    <span className="text-sm">{site.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* 加载指示器 */}
        {isLoading && currentUrl && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20 z-20">
            <div className="h-full bg-primary animate-pulse" style={{ width: '60%' }} />
          </div>
        )}
        
        {/* 状态指示 */}
        {webviewCreated && !error && currentUrl && (
          <div className="absolute bottom-2 right-2 px-2 py-1 bg-green-500/20 text-green-600 text-xs rounded opacity-0 hover:opacity-100 transition-opacity z-10">
            ✓ 已加载
          </div>
        )}
      </div>
    </div>
  );
}
