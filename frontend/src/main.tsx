import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { router } from './routes';
import { useUI } from './stores/ui';
import './design/tokens.css';
import './styles.css';
import './design/refinement.css';
import './design/apple.css';
// v2 层固定排在 v1 之后：只声明 --ds-* 与 [data-ds='v2'] 作用域规则。
import './design/v2-tokens.css';
import './design/v2/base.css';
import './design/v2/primitives.css';
import './design/v2/shell.css';
import './design/v2/pages.css';
import { financeTheme } from './design/theme';
import { NetworkStatus, startPwa } from './components/Pwa';
import { applyDsMode, readDsMode } from './design/ds-mode';
dayjs.locale('zh-cn');
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: 'always',
      refetchInterval: false,
      refetchIntervalInBackground: false,
    },
    mutations: { retry: false, networkMode: 'always' },
  },
});
function Root() {
  const language = useUI((s) => s.language);
  // 一次会话内不变：切换模式走 setDsMode() 的整页重载。
  const [dsMode] = useState(readDsMode);
  useEffect(() => {
    document.documentElement.lang = language;
    dayjs.locale(language === 'en' ? 'en' : 'zh-cn');
  }, [language]);
  const mode = useUI((s) => s.theme);
  const [systemDark, setSystemDark] = useState(
    matchMedia('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const [reducedMotion, setReducedMotion] = useState(
    matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = (event: MediaQueryListEvent) =>
      setReducedMotion(event.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const dark = mode === 'dark' || (mode === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#131a2b' : '#4564ed');
  }, [dark]);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const clear = () => {
      root.style.removeProperty('--visual-viewport-height');
      root.style.removeProperty('--visual-viewport-offset-top');
    };
    const resize = () => {
      // Leave browser zoom in control; these dimensions keep touch forms above the keyboard.
      if (Math.abs(viewport.scale - 1) > 0.01) {
        clear();
        return;
      }
      root.style.setProperty(
        '--visual-viewport-height',
        `${viewport.height}px`,
      );
      root.style.setProperty(
        '--visual-viewport-offset-top',
        `${viewport.offsetTop}px`,
      );
    };
    resize();
    viewport.addEventListener('resize', resize);
    viewport.addEventListener('scroll', resize);
    return () => {
      viewport.removeEventListener('resize', resize);
      viewport.removeEventListener('scroll', resize);
      clear();
    };
  }, []);
  return (
    <div data-theme={dark ? 'dark' : 'light'}>
      <ConfigProvider
        locale={language === 'en' ? enUS : zhCN}
        theme={financeTheme(dark, reducedMotion, dsMode)}
      >
        <App>
          <NetworkStatus />
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </App>
      </ConfigProvider>
    </div>
  );
}
async function start() {
  applyDsMode();
  void startPwa();
  if (import.meta.env.VITE_ENABLE_MOCK === 'true') {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>,
  );
}
start().catch(() => {
  document.getElementById('root')!.textContent =
    import.meta.env.VITE_ENABLE_MOCK === 'true'
      ? '应用启动失败，请检查 Mock Service Worker 文件与网络配置。'
      : '应用启动失败，请刷新页面或检查应用资源。';
});
