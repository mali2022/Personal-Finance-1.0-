import { usePreferredCurrency } from '../hooks/useCurrency';
import { ProductVersion } from '../features/releases/product';
import { concertApi } from '../features/concerts/api';
import { t as tr, useLocale } from '../i18n';
import { LanguageSelect } from '../components/LanguageSelect';
import { UserAvatar } from '../components/UserAvatar';
import { useEffect, useRef, useState } from 'react';
import {
  App,
  Breadcrumb,
  Drawer,
  Button,
  Dropdown,
  Input,
  Layout,
  Menu,
  Tag,
  Tooltip,
} from 'antd';
import type { InputRef } from 'antd';
import {
  MenuOutlined,
  CloseOutlined,
  RobotOutlined,
  BulbOutlined,
  BarChartOutlined,
  DashboardOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  CalendarOutlined,
  DownOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoreOutlined,
  PieChartOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
  SwapOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/client';
import {
  activeNavigation,
  groupRoutes,
  navigationEntries,
  navigationGroups,
} from '../design/navigation';
import { useUI } from '../stores/ui';
import { QuickEntry } from '../features/transactions/QuickEntry';
import { OperationRecovery } from '../components/OperationRecovery';
import '../design/shell.css';
import { GlobalCopilot } from '../features/ai/GlobalCopilot';
import { AiChatFab } from '../features/ai/AiChatFab';
import { useCopilot } from '../features/ai/copilotContext';
export default function AppLayout() {
  return (
    <GlobalCopilot>
      <AppShell />
      <AiChatFab />
    </GlobalCopilot>
  );
}
function AppShell() {
  useLocale();
  const openCopilot = useCopilot();
  const preferredCurrency = usePreferredCurrency();
  const location = useLocation();
  const navigate = useNavigate();
  const hidden = useUI((s) => s.hidden);
  const toggleHidden = useUI((s) => s.toggleHidden);
  const openEntry = useUI((s) => s.openEntry);
  const searchRef = useRef<InputRef>(null);
  const cache = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: authApi.me,
    retry: false,
  });
  const { message } = App.useApp();
  const current = activeNavigation(location.pathname);
  const groupIcons: Record<string, React.ReactNode> = {
    overview: <DashboardOutlined />,
    bookkeeping: <SwapOutlined />,
    assets: <WalletOutlined />,
    'payroll-center': <CalendarOutlined />,
    planning: <PieChartOutlined />,
    analysis: <BarChartOutlined />,
    'ai-center': <RobotOutlined />,
  };
  const optionalModules = useQuery({ queryKey: ['optional-modules'], queryFn: concertApi.modules });
  const navigation = navigationGroups.map((g) => ({
    key: g.key,
    label: tr(g.label),
    icon: groupIcons[g.key],
    children: groupRoutes(g)
      .filter(([key]) => key !== '/concerts' || optionalModules.data?.concerts === true)
      .map(([key, label]) => ({ key, label: tr(label) })),
  }));
  const settingsEntry = (compact = false) => (
    <Tooltip title={compact ? tr('设置与管理') : undefined} placement="right">
      <Link
        to="/settings"
        className="shell-settings-entry"
        aria-label={tr('设置与管理')}
        aria-current={current?.group === 'settings' ? 'page' : undefined}
        onClick={() => setMobileOpen(false)}
      >
        <SettingOutlined />
        {!compact && <span>{tr('设置与管理')}</span>}
      </Link>
    </Tooltip>
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<string[]>([
    current?.group || 'overview',
  ]);
  const mode = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  useEffect(() => {
    if (current?.group && current.group !== 'settings')
      setOpenGroups((groups) =>
        groups.includes(current.group) ? groups : [...groups, current.group],
      );
  }, [current?.group]);
  const [collapsed, setCollapsed] = useState(false);
  const [panelGroupKey, setPanelGroupKey] = useState(
    current?.group ?? navigationGroups[0].key,
  );
  useEffect(() => {
    if (current?.group) setPanelGroupKey(current.group);
  }, [current?.group]);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 991px)');
    const sync = (list: MediaQueryList | MediaQueryListEvent) =>
      setCollapsed(list.matches);
    sync(query);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  const panelGroup =
    navigationEntries.find((group) => group.key === panelGroupKey) ??
    navigationGroups[0];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const element = e.target as HTMLElement;
      if (
        element.closest(
          'input, textarea, select, [contenteditable="true"], [role="combobox"]',
        ) ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        document.querySelector('.ant-drawer-open,.ant-modal-wrap')
      )
        return;
      const key = e.key.toLowerCase();
      if (key === '/') {
        e.preventDefault();
        setMobileSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (key === 'n' || key === 'e') openEntry('Expense');
      if (key === 'i') openEntry('Income');
      if (key === 't') openEntry('Transfer');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openEntry]);
  useEffect(() => {
    if (mobileSearchOpen) searchRef.current?.focus();
  }, [mobileSearchOpen]);
  useEffect(() => {
    setMobileOpen(false);
    setMobileSearchOpen(false);
  }, [location.pathname, location.search]);
  return (
    <Layout className="app-shell">
      <a className="skip-link" href="#main-content">
        {tr('跳转到主要内容')}
      </a>
      <aside
        className={`sidebar shell-sidebar${collapsed ? ' is-collapsed' : ''}`}
      >
        <div className="shell-rail">
          <div className="rail-brand" title="Personal Finance">
            <span className="brand-symbol" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none">
                <path
                  d="M8 24V17M16 24V12M24 24V7"
                  stroke="currentColor"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <path
                  d="M7 10L13 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity=".55"
                />
              </svg>
            </span>
          </div>
          <nav className="rail-groups" aria-label={tr('桌面功能导航')}>
            {navigationGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                className={`rail-group ${
                  panelGroup.key === group.key ? 'is-open' : ''
                } ${current?.group === group.key ? 'is-current' : ''}`}
                data-group={group.key}
                title={tr(group.label)}
                aria-label={tr(group.label)}
                aria-expanded={!collapsed && panelGroup.key === group.key}
                aria-current={current?.group === group.key ? 'true' : undefined}
                onClick={() => {
                  setPanelGroupKey(group.key);
                  setCollapsed(false);
                }}
              >
                {groupIcons[group.key]}
              </button>
            ))}
          </nav>
          <div className="rail-footer">
            <Tooltip title={tr('设置与管理')} placement="right">
              <Link
                to="/settings"
                className={`rail-group ${
                  panelGroup.key === 'settings' ? 'is-open' : ''
                } ${current?.group === 'settings' ? 'is-current' : ''}`}
                data-group="settings"
                aria-label={tr('设置与管理')}
                aria-current={
                  current?.group === 'settings' ? 'page' : undefined
                }
                onClick={() => {
                  setPanelGroupKey('settings');
                  setMobileOpen(false);
                }}
              >
                <SettingOutlined />
              </Link>
            </Tooltip>
            <Button
              className="rail-collapse"
              aria-label={collapsed ? tr('展开侧边导航') : tr('折叠侧边导航')}
              aria-expanded={!collapsed}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((value) => !value)}
            />
          </div>
        </div>
        {!collapsed && (
          <div className="shell-panel">
            <div className="panel-head">
              <span className="panel-eyebrow">Personal Finance</span>
              <h2 className="panel-title">{tr(panelGroup.label)}</h2>
            </div>
            <nav className="panel-nav" aria-label={tr('分组功能导航')}>
              {panelGroup.sections.map((section) => {
                const routes = section.routes.filter(
                  ([key]) =>
                    key !== '/concerts' ||
                    optionalModules.data?.concerts === true,
                );
                if (!routes.length) return null;
                return (
                  <div className="panel-section" key={section.key}>
                    {section.label && (
                      <p className="panel-section-label">{tr(section.label)}</p>
                    )}
                    <ul className="panel-list">
                      {routes.map(([key, label]) => (
                        <li key={key}>
                          <Link
                            to={key}
                            className="panel-link"
                            data-path={key}
                            aria-current={
                              current?.key === key ? 'page' : undefined
                            }
                          >
                            {tr(label)}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </nav>
            <div className="panel-footer">
              <div className="sidebar-workspace">
                <span className="workspace-icon">
                  <WalletOutlined />
                </span>
                <div>
                  <strong>{tr('个人账本')}</strong>
                  <small>
                    <span className="workspace-dot" />
                    {preferredCurrency}
                  </small>
                </div>
                <span className="workspace-status" aria-label={tr('个人账本')}>
                  {preferredCurrency}
                </span>
              </div>
            </div>
          </div>
        )}
      </aside>
      <Layout className={`main-layout ${collapsed ? 'collapsed' : ''}`}>
        <Layout.Header
          className={`topbar ${mobileSearchOpen ? 'mobile-search-open' : ''}`}
        >
          <Button
            className="mobile-menu-toggle"
            aria-label={tr('打开全部导航')}
            icon={<MenuOutlined />}
            onClick={() => setMobileOpen(true)}
          />
          <div className="header-context">
            <span className="mobile-page-name">
              {tr(current?.label || '个人空间')}
            </span>
            <Breadcrumb
              className="header-breadcrumb"
              items={[
                { title: tr(current?.groupLabel || '个人空间') },
                { title: tr(current?.label || '详情') },
              ]}
            />
          </div>
          <Input
            ref={searchRef}
            id="shell-search"
            className="global-search"
            prefix={<SearchOutlined />}
            placeholder={tr('搜索交易、商户或备注')}
            suffix={<kbd>/</kbd>}
            aria-label={tr('全局搜索')}
            onPressEnter={(e) =>
              navigate(
                `/transactions?keyword=${encodeURIComponent(e.currentTarget.value)}`,
              )
            }
          />
          <div className="header-actions">
            <div className="header-utilities">
              <Button
                type="text"
                className="mobile-search-toggle"
                aria-label={mobileSearchOpen ? tr('关闭搜索') : tr('打开搜索')}
                aria-expanded={mobileSearchOpen}
                aria-controls="shell-search"
                icon={mobileSearchOpen ? <CloseOutlined /> : <SearchOutlined />}
                onClick={() => setMobileSearchOpen((value) => !value)}
              />
              <Tooltip title={tr('询问当前页面')}>
                <Button
                  type="text"
                  className="global-copilot-button"
                  aria-label={tr('打开全局 AI Copilot')}
                  icon={<RobotOutlined />}
                  onClick={() => openCopilot()}
                >
                  <span className="global-copilot-label">AI Copilot</span>
                </Button>
              </Tooltip>
              <LanguageSelect />
              <Tooltip destroyOnHidden title={tr('切换浅色 / 深色主题')}>
                <Button
                  type="text"
                  aria-label={tr('切换主题')}
                  icon={<BulbOutlined />}
                  onClick={() =>
                    setTheme(
                      mode === 'dark' ||
                        (mode === 'system' &&
                          matchMedia('(prefers-color-scheme: dark)').matches)
                        ? 'light'
                        : 'dark',
                    )
                  }
                />
              </Tooltip>
              {import.meta.env.VITE_ENABLE_MOCK === 'true' && (
                <Tag color="gold">{tr('演示账本')}</Tag>
              )}
              <Tooltip title={hidden ? tr('显示金额') : tr('隐藏金额')}>
                <Button
                  aria-label={hidden ? tr('显示金额') : tr('隐藏金额')}
                  type="text"
                  icon={hidden ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  onClick={toggleHidden}
                />
              </Tooltip>
            </div>
            <div className="header-compose">
              <Button
                className="header-entry"
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openEntry('Expense')}
              >
                {tr('记一笔')}
              </Button>
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    { key: 'Refund', label: tr('退款') },
                    { key: 'CreditCardPayment', label: tr('信用卡还款') },
                    { key: 'AssetLoss', label: tr('资产损失') },
                  ],
                  onClick: ({ key }) => {
                    if (key.startsWith('/')) navigate(key);
                    else if (
                      key === 'Refund' ||
                      key === 'CreditCardPayment' ||
                      key === 'AssetLoss'
                    )
                      openEntry(key);
                  },
                }}
              >
                <Button
                  className="header-more"
                  aria-label={tr('更多交易')}
                  icon={<MoreOutlined />}
                />
              </Dropdown>
            </div>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'settings',
                    label: tr('设置与管理'),
                    icon: <SettingOutlined />,
                  },
                  {
                    key: 'logout',
                    label: tr('退出登录'),
                    icon: <LogoutOutlined />,
                  },
                ],
                onClick: async ({ key }) => {
                  if (key === 'settings') navigate('/settings');
                  else
                    try {
                      await authApi.logout();
                      void cache.cancelQueries();
                      cache.clear();
                      useUI.getState().closeEntry();
                      navigate('/login');
                    } catch {
                      message.error(tr('退出失败，请重试'));
                    }
                },
              }}
              trigger={['click']}
            >
              <Button
                type="text"
                className="user-button"
                aria-label={tr('用户菜单')}
              >
                <UserAvatar
                  userId={session.data?.id}
                  updatedAt={session.data?.avatarUpdatedAt}
                  name={session.data?.displayName}
                />
                <span className="user-name">
                  {session.data?.displayName || tr('个人空间')}
                </span>
                <DownOutlined className="user-chevron" />
              </Button>
            </Dropdown>
          </div>
        </Layout.Header>
        <Layout.Content
          className="content"
          id="main-content"
          role="main"
          tabIndex={-1}
        >
          <OperationRecovery userId={session.data?.id} />
          <Outlet />
          <ProductVersion />
        </Layout.Content>
      </Layout>
      {!mobileOpen && (
        <nav className="mobile-nav" aria-label={tr('手机导航')}>
          <button
            aria-label={tr('打开全部功能')}
            onClick={() => setMobileOpen(true)}
          >
            <MenuOutlined />
            {tr('全部功能')}
          </button>
          <button
            className="mobile-add"
            onClick={() => openEntry('Expense')}
            aria-label={tr('快速记账')}
          >
            <PlusOutlined />
            {tr('记账')}
          </button>
          <button
            onClick={() => navigate('/settings')}
            aria-current={current?.group === 'settings' ? 'page' : undefined}
          >
            <SettingOutlined />
            {tr('设置与管理')}
          </button>
        </nav>
      )}
      <Drawer
        rootClassName="shell-mobile-drawer"
        title={tr('全部功能')}
        placement="left"
        width="min(360px, 100vw)"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        extra={<LanguageSelect />}
        footer={settingsEntry()}
      >
        <Button
          block
          icon={<RobotOutlined />}
          aria-label={tr('打开全局 AI Copilot')}
          onClick={() => {
            setMobileOpen(false);
            openCopilot();
          }}
        >
          AI Copilot
        </Button>
        <nav aria-label={tr('手机功能导航')}>
          <Menu
            mode="inline"
            selectedKeys={current ? [current.key] : []}
            openKeys={openGroups}
            onOpenChange={setOpenGroups}
            items={navigation}
            onClick={({ key }) => {
              navigate(key);
              setMobileOpen(false);
            }}
          />
        </nav>
      </Drawer>
      <QuickEntry />
    </Layout>
  );
}
