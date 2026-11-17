import { t as tr, useLocale } from '../i18n';
import { useEffect, useState } from 'react';
import { Alert, Button, Card } from 'antd';
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let prompt: InstallPrompt | undefined;
export async function startPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt = event as InstallPrompt;
    window.dispatchEvent(new Event('finance:pwa-ready'));
  });
  if (
    import.meta.env.PROD &&
    import.meta.env.VITE_ENABLE_MOCK !== 'true' &&
    'serviceWorker' in navigator
  ) {
    try {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    } catch {
      window.dispatchEvent(new Event('finance:pwa-unavailable'));
    }
  }
}
export function NetworkStatus() {
  useLocale();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online ? null : (
    <Alert
      showIcon
      type="warning"
      message={tr("当前离线：仅缓存应用资源，财务操作需要联网，未保存交易不会排队提交。")}
    />
  );
}
export function PwaSettings() {
  useLocale();
  const [available, setAvailable] = useState(!!prompt);
  useEffect(() => {
    const update = () => setAvailable(!!prompt);
    window.addEventListener('finance:pwa-ready', update);
    return () => window.removeEventListener('finance:pwa-ready', update);
  }, []);
  return (
    <Card className="mt20" title={tr("安装与离线资源")}>
      <Button
        disabled={!available}
        onClick={async () => {
          await prompt?.prompt();
          await prompt?.userChoice;
          prompt = undefined;
          setAvailable(false);
        }}
      >
        {tr("安装应用")}</Button>
    </Card>
  );
}
