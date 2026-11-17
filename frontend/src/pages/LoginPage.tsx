import { ProductVersion } from '../features/releases/product';
import { t as tr, useLocale } from '../i18n';
import { LanguageSelect } from '../components/LanguageSelect';
import { useUI } from '../stores/ui';
import { App, Alert, Button, Card, Form, Input } from 'antd';
import {
  ArrowRightOutlined,
  BarChartOutlined,
  LockOutlined,
  MailOutlined,
  PieChartOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/client';
import type { ApiError } from '../types';
import '../design/auth.css';
export default function LoginPage() {
  useLocale();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const login = useMutation({
    mutationFn: (v: { email: string; password: string }) =>
      authApi.login(v.email, v.password),
    onSuccess: (user) => {
      if (user.language) useUI.getState().setLanguage(user.language);
      cache.clear();
      cache.setQueryData(['session'], user);
      navigate('/', { replace: true });
    },
    onError: (e: ApiError) => message.error(e.message),
  });
  return (
    <main className="login-page auth-page">
      <div className="auth-layout">
        <aside className="auth-intro">
          <div className="auth-brand">
            <span className="auth-brand-symbol" aria-hidden="true">
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
            <span>Personal Finance</span>
          </div>
          <div className="auth-intro-copy">
            <h2>{tr('把生活记清楚')}</h2>
          </div>
          <div className="auth-illustration" aria-hidden="true">
            <div className="auth-orbit auth-orbit-one" />
            <div className="auth-orbit auth-orbit-two" />
            <div className="auth-preview">
              <div className="auth-preview-heading">
                <span />
                <i />
                <i />
              </div>
              <div className="auth-preview-content">
                <div className="auth-preview-ring">
                  <span />
                </div>
                <div className="auth-preview-lines">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="auth-preview-chart">
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="auth-floating-icon auth-floating-wallet">
              <WalletOutlined />
            </div>
            <div className="auth-floating-icon auth-floating-chart">
              <BarChartOutlined />
            </div>
          </div>
          <div className="auth-feature-list">
            <span>
              <WalletOutlined />
              {tr('账户管理')}
            </span>
            <span>
              <BarChartOutlined />
              {tr('收支分析')}
            </span>
            <span>
              <PieChartOutlined />
              {tr('预算计划')}
            </span>
          </div>
        </aside>
        <Card className="auth-form-panel">
          <ProductVersion />
          <div className="auth-toolbar">
            <LanguageSelect />
          </div>
          <div className="auth-heading">
            <h1>{tr('欢迎回到你的账本')}</h1>
          </div>
          {import.meta.env.VITE_ENABLE_MOCK === 'true' && (
            <Alert
              type="info"
              className="mb16"
              message={tr(
                '演示模式：可使用任意有效邮箱与非空密码。数据刷新后重置。',
              )}
            />
          )}
          <Form layout="vertical" onFinish={login.mutate}>
            <Form.Item
              name="email"
              label={tr('邮箱')}
              rules={[
                { required: true, message: tr('请输入邮箱') },
                { type: 'email', message: tr('请输入有效邮箱') },
              ]}
            >
              <Input
                autoComplete="username"
                prefix={<MailOutlined />}
                placeholder={tr('请输入邮箱')}
              />
            </Form.Item>
            <Form.Item
              name="password"
              label={tr('密码')}
              rules={[{ required: true, message: tr('请输入密码') }]}
            >
              <Input.Password
                autoComplete="current-password"
                prefix={<LockOutlined />}
                placeholder={tr('请输入密码')}
              />
            </Form.Item>
            <Button
              block
              type="primary"
              size="large"
              htmlType="submit"
              loading={login.isPending}
              className="auth-submit"
            >
              {tr('登录')}
              <ArrowRightOutlined aria-hidden="true" />
            </Button>
          </Form>
          <p className="auth-switch">
            <Link to="/register">{tr('持有邀请码？激活进入')}</Link>
            {' · '}
            <Link to="/updates">{tr('版本更新')}</Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
