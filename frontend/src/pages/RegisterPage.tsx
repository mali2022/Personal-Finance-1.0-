import { ProductVersion } from '../features/releases/product';
import { Alert, App, Button, Card, Form, Input, Skeleton } from 'antd';
import {
  ArrowRightOutlined,
  BarChartOutlined,
  LockOutlined,
  MailOutlined,
  PieChartOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient, authApi } from '../api/client';
import { LanguageSelect } from '../components/LanguageSelect';
import { ErrorState } from '../components/Feedback';
import { isValidNewPassword } from '../utils/password';
import { useUI } from '../stores/ui';
import { t as tr, useLocale } from '../i18n';
import type { ApiError } from '../types';
import '../design/auth.css';
export default function RegisterPage() {
  useLocale();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const [form] = Form.useForm();
  const validateInvite = useMutation({
    mutationFn: async () => {
      await form.validateFields(['email', 'inviteCode']);
      await apiClient.get('/auth/csrf');
      return apiClient.post('/auth/invitations/validate', {
        code: form.getFieldValue('inviteCode'),
        email: form.getFieldValue('email'),
      });
    },
  });
  const options = useQuery({
    queryKey: ['auth-options'],
    queryFn: authApi.options,
    retry: false,
  });
  const register = useMutation({
    mutationFn: (v: {
      email: string;
      password: string;
      displayName: string;
      inviteCode?: string;
    }) =>
      authApi.register({
        email: v.email,
        inviteCode: v.inviteCode,
        password: v.password,
        displayName: v.displayName,
        language: useUI.getState().language,
      }),
    onSuccess: (user) => {
      cache.clear();
      cache.setQueryData(['session'], user);
      navigate('/profile', { replace: true });
    },
    onError: (e: ApiError) => message.error(e.message),
  });
  return (
    <main className="login-page auth-page auth-register">
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
            <h1>{tr('使用邀请码激活账本')}</h1>
          </div>
          {options.isPending ? (
            <Skeleton active />
          ) : options.isError ? (
            <ErrorState error={options.error} retry={() => options.refetch()} />
          ) : options.data.registrationEnabled === false &&
            !options.data.invitationActivationEnabled ? (
            <Alert type="info" message={tr('注册已关闭，请联系管理员')} />
          ) : (
            <Form
              form={form}
              onValuesChange={() => validateInvite.reset()}
              layout="vertical"
              onFinish={register.mutate}
              disabled={register.isPending}
            >
              <Alert
                className="mb16"
                type="info"
                message={tr(
                  '公开注册已关闭。邀请码仅用于一次性激活，已有用户请直接登录。',
                )}
              />
              <Form.Item
                name="inviteCode"
                label={tr('邀请码')}
                rules={[
                  {
                    required: !options.data.registrationEnabled,
                    message: tr('请输入管理员提供的邀请码'),
                  },
                  { max: 67, message: tr('邀请码格式无效') },
                ]}
              >
                <Input.Password autoComplete="off" placeholder="PF-…" />
              </Form.Item>
              <Form.Item
                name="displayName"
                label={tr('显示名称')}
                rules={[
                  {
                    required: true,
                    whitespace: true,
                    message: tr('请输入显示名称'),
                  },
                  { max: 100 },
                ]}
              >
                <Input
                  autoComplete="nickname"
                  maxLength={100}
                  prefix={<UserOutlined />}
                  placeholder={tr('请输入显示名称')}
                />
              </Form.Item>
              <Form.Item
                name="email"
                label={tr('邮箱')}
                rules={[
                  { required: true, message: tr('请输入邮箱') },
                  { type: 'email', message: tr('请输入有效邮箱') },
                  { max: 256 },
                ]}
              >
                <Input
                  autoComplete="username"
                  maxLength={256}
                  prefix={<MailOutlined />}
                  placeholder={tr('请输入邮箱')}
                />
              </Form.Item>
              <Form.Item
                name="password"
                label={tr('密码')}
                rules={[
                  { required: true, message: tr('请输入密码') },
                  {
                    validator: (_, value: string) =>
                      !value || isValidNewPassword(value)
                        ? Promise.resolve()
                        : Promise.reject(
                            new Error(tr('密码至少12个字符，并包含字母和数字')),
                          ),
                  },
                ]}
              >
                <Input.Password
                  autoComplete="new-password"
                  maxLength={128}
                  prefix={<LockOutlined />}
                />
              </Form.Item>
              <Form.Item
                name="confirm"
                label={tr('确认密码')}
                dependencies={['password']}
                rules={[
                  { required: true, message: tr('请输入密码') },
                  ({ getFieldValue }) => ({
                    validator: (_, value) =>
                      value === getFieldValue('password')
                        ? Promise.resolve()
                        : Promise.reject(new Error(tr('两次密码不一致'))),
                  }),
                ]}
              >
                <Input.Password
                  autoComplete="new-password"
                  maxLength={128}
                  prefix={<LockOutlined />}
                />
              </Form.Item>
              <Button
                block
                type="primary"
                htmlType="submit"
                loading={register.isPending}
                disabled={
                  !options.data?.registrationEnabled &&
                  !options.data?.invitationActivationEnabled
                }
                className="auth-submit"
              >
                {tr('创建账户')}
                <ArrowRightOutlined aria-hidden="true" />
              </Button>
              <Button
                block
                onClick={() => validateInvite.mutate()}
                loading={validateInvite.isPending}
              >
                {tr('验证邀请码')}
              </Button>
              {validateInvite.isSuccess && (
                <Alert
                  type="success"
                  message={tr('邀请码有效，提交激活时将再次核验')}
                />
              )}
              {validateInvite.isError && (
                <ErrorState error={validateInvite.error} />
              )}
            </Form>
          )}
          <p className="auth-switch">
            <Link to="/login">{tr('已有账户？登录')}</Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
