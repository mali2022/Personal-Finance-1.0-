import { Suspense } from 'react';
import { Button, Skeleton } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { Outlet, useLocation } from 'react-router-dom';
import { t, useLocale } from '../i18n';
import { PageTitle } from '../components/PageTitle';
import { useCopilot } from '../features/ai/copilotContext';
export { useCopilot } from '../features/ai/copilotContext';
import '../design/ai-center.css';
export default function AiCenterLayout() {
  useLocale();
  const location = useLocation();
  const ask = useCopilot();
  return (
    <div className="ai-center">
      <div className="ai-center-heading">
        <div>
          <PageTitle>{t('AI 智能中心')}</PageTitle>
        </div>
        <Button icon={<RobotOutlined />} onClick={() => ask()}>
          {t('打开侧边 Copilot')}
        </Button>
      </div>
      <Suspense fallback={<Skeleton active />}>
        <Outlet key={location.pathname} />
      </Suspense>
    </div>
  );
}
