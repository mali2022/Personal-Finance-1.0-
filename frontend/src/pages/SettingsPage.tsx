import { groupRoutes, settingsNavigation } from '../design/navigation';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '../api/client';
import { usePreferredCurrency } from '../hooks/useCurrency';
import { t as tr, useLocale } from '../i18n';
import { PageTitle } from '../components/PageTitle';
import { PwaSettings } from '../components/Pwa';
import { ExportPanel } from '../features/reports/ExportPanel';
import { Link } from 'react-router-dom';
import { Card, Descriptions, Radio, Space } from 'antd';
import { useUI } from '../stores/ui';
import { AccountSelector } from '../components/Selectors';
import { LanguageSelect } from '../components/LanguageSelect';
import { ModuleSettings } from '../features/concerts/ModuleSettings';
export default function SettingsPage() {
  useLocale();
  const preferredCurrency = usePreferredCurrency();
  const session = useQuery({ queryKey: ['session'], queryFn: authApi.me });
  const managementLinks = [
    ...groupRoutes(settingsNavigation).filter(([path]) => path !== '/settings'),
    ...(session.data?.permissions.includes('admin:manage')
      ? [['/admin', tr('后台管理')]]
      : []),
  ];
  const {
    theme,
    setTheme,
    hidden,
    toggleHidden,
    defaultAccount,
    setDefaultAccount,
  } = useUI();
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr('设置与管理')}</PageTitle>
        </div>
      </div>
      <Card title={tr('设置入口')} className="mb16">
        <Space wrap>
          {managementLinks.map(([path, label]) => (
            <Link key={path} to={path}>
              {tr(label)}
            </Link>
          ))}
        </Space>
      </Card>
      <Card title={tr('基本设置')}>
        <Descriptions
          column={1}
          items={[
            {
              key: 'language',
              label: tr('语言'),
              children: <LanguageSelect />,
            },
            {
              key: 'theme',
              label: tr('界面主题'),
              children: (
                <Radio.Group
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  options={[
                    { value: 'light', label: tr('浅色') },
                    { value: 'dark', label: tr('深色') },
                    { value: 'system', label: tr('跟随系统') },
                  ]}
                />
              ),
            },
            {
              key: 'hidden',
              label: tr('金额显示'),
              children: (
                <Radio.Group
                  value={hidden}
                  onChange={toggleHidden}
                  options={[
                    { value: false, label: tr('显示金额') },
                    { value: true, label: tr('隐藏金额') },
                  ]}
                />
              ),
            },
            {
              key: 'account',
              label: tr('默认记账账户'),
              children: (
                <div className="settings-account-selector">
                  <AccountSelector
                    value={defaultAccount}
                    onChange={setDefaultAccount}
                  />
                </div>
              ),
            },
            {
              key: 'date',
              label: tr('时间与币种'),
              children:
                'Asia/Shanghai · ISO 8601 · ' +
                tr('默认货币') +
                ' ' +
                preferredCurrency,
            },
          ]}
        />
      </Card>
      <PwaSettings />
      <ModuleSettings />
      <ExportPanel />
      <Card className="mt20" title={tr('财务统计口径管理')}>
        <Link to="/settings/statistics">
          {tr('管理十类统计规则、预设方案与真实账本预览')}
        </Link>
      </Card>
    </>
  );
}
