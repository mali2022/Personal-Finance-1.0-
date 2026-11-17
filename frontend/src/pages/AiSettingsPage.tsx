import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Form,
  Space,
  Switch,
  Table,
  Typography,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { aiApi, type AiPrivacy } from '../api/ai';
import { ErrorState } from '../components/Feedback';
import { PageTitle } from '../components/PageTitle';
import { t, useLocale } from '../i18n';

export default function AiSettingsPage() {
  const locale = useLocale();
  const settings = useQuery({
    queryKey: ['ai-settings'],
    queryFn: aiApi.settings,
  });
  const usage = useQuery({ queryKey: ['ai-usage'], queryFn: aiApi.usage });
  const cache = useQueryClient();
  const { message } = App.useApp();
  const [testing, setTesting] = useState(false);
  const [privacyForm] = Form.useForm<AiPrivacy>();
  const save = useMutation({
    mutationFn: aiApi.privacy,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['ai-settings'] });
      message.success(t('AI 授权已更新'));
    },
    onError: (e: Error) => message.error(e.message),
  });
  if (settings.isError)
    return (
      <ErrorState error={settings.error} retry={() => settings.refetch()} />
    );
  const s = settings.data;
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <PageTitle>{t('AI 与隐私')}</PageTitle>
      <Space wrap><Link to="/settings/ai/advanced">{t('AI 智能管理 · 高级功能')}</Link><Link to="/ai/agent">{t('自主财务 Agent')}</Link></Space>
      <Alert
        type="info"
        showIcon
        message={t('DeepSeek 云端服务')}
        description={s?.transmission || t('正在读取授权状态')}
      />
      {s && (
        <>
          <Card title={t('服务端配置')}>
            <Descriptions
              column={1}
              items={[
                { key: 'provider', label: t('服务'), children: s.provider },
                { key: 'model', label: t('模型'), children: s.model },
                {
                  key: 'status',
                  label: t('状态'),
                  children: s.enabled
                    ? s.configured
                      ? t('密钥已配置，连接需验证')
                      : t('服务端未配置密钥')
                    : t('服务端 AI 已关闭'),
                },
                {
                  key: 'limit',
                  label: t('AI 全功能模式'),
                  children: t('已启用'),
                },
                ...Object.entries(s.capabilities).map(([key, value]) => ({
                  key,
                  label: key,
                  children: value,
                })),
              ]}
            />
            <Alert
              type="warning"
              message={s.legacyModels}
              style={{ marginBlock: 16 }}
            />
            <Space>
              <Button
                loading={testing}
                disabled={!s.enabled || !s.configured || !s.privacy.enabled}
                onClick={async () => {
                  setTesting(true);
                  try {
                    await aiApi.test();
                    message.success(t('真实 DeepSeek 连接成功'));
                  } catch (e) {
                    message.error((e as Error).message);
                  } finally {
                    setTesting(false);
                    void cache.invalidateQueries({ queryKey: ['ai-usage'] });
                  }
                }}
              >
                {t('测试真实连接')}
              </Button>
              <a href={s.documentation} target="_blank" rel="noreferrer">
                {t('官方文档')}
              </a>
              <Link to="/ai">{t('打开 AI 助手')}</Link>
            </Space>
          </Card>
          <Card title={t('财务数据授权')}>
            <Alert type="info" showIcon style={{ marginBottom: 16 }} message={locale === 'en' ? 'L1 automatic personal reads · L2 suggestions · L3 confirmed changes · L4 separate high-risk approval' : 'L1 本人数据自动只读 · L2 生成建议 · L3 确认后变更 · L4 高风险独立授权'} description={locale === 'en' ? 'AI can investigate your personal ledger after you enable it. Account restrictions still apply. Family data, descriptions and recognition text remain separately controlled.' : '全量授权仅覆盖当前用户可访问的数据。财务修改、删除和付款仍需独立执行权限与确认。'} />
            <Form<AiPrivacy>
              form={privacyForm}
              key={JSON.stringify(s.privacy)}
              layout="vertical"
              initialValues={{ ...s.privacy, personalReadAccess: s.privacy.personalReadAccess ?? true }}
              onFinish={(b) => save.mutate({ ...b, personalReadAccess: false, allowSummary: false, allowDetails: false, allowPayroll: false, allowFamily: false, allowRecognitionText: false })}
            >
              <Form.Item
                name="enabled"
                label={t('开启 AI，允许发送主动输入的问题')}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Form.Item name="fullFinancialAccess" label={locale === 'en' ? 'Allow AI to use all my financial information' : '允许 AI 使用我的全部财务信息'} valuePropName="checked"><Switch /></Form.Item>
              <Alert type="info" message={locale === 'en' ? 'Enabling this lets AI read and analyze all supported financial information you can access. Queried data, including descriptions and reviewed recognition text, may be sent to the configured AI provider. This does not authorize changes, deletion or payments. Save to apply or revoke.' : '开启后，AI 可以读取并联合分析您在 Personal Finance 中的全部财务信息，用于财务问答、自动记账、对账、预测、模拟和其他智能分析功能。查询结果（含描述及已校对识别文字）可能发送至配置的第三方 AI 服务商。此授权不包括修改、删除或付款；保存后生效或撤销。'} />
              <Form.Item
                name="saveHistory"
                label={t(
                  '保存会话历史与查询依据到本机数据库（可搜索、归档和删除）',
                )}
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Button type="primary" htmlType="submit" loading={save.isPending}>
                {t('保存授权')}
              </Button>
            </Form>
          </Card>
        </>
      )}
      <Card title={t('调用用量（最近100次尝试）')}>
        <Typography.Paragraph>{usage.data?.costNote}</Typography.Paragraph>
        {usage.isError ? (
          <ErrorState error={usage.error} retry={() => usage.refetch()} />
        ) : (
          <Table
            size="small"
            rowKey="id"
            dataSource={usage.data?.items}
            loading={usage.isPending}
            scroll={{ x: 800 }}
            columns={[
              {
                title: t('时间'),
                dataIndex: 'requestedAt',
                render: (v: string) => new Date(v).toLocaleString(locale),
              },
              { title: t('模型'), dataIndex: 'model' },
              { title: t('功能'), dataIndex: 'feature' },
              {
                title: t('输入 Token'),
                dataIndex: 'inputTokens',
                render: (v: number | null) => v ?? t('未知'),
              },
              {
                title: t('输出 Token'),
                dataIndex: 'outputTokens',
                render: (v: number | null) => v ?? t('未知'),
              },
              {
                title: t('预计费用'),
                render: (_, r) =>
                  r.estimatedCost == null
                    ? t('费用待估算')
                    : `${r.estimatedCost} ${r.priceCurrency}`,
              },
              {
                title: t('状态'),
                dataIndex: 'errorCode',
                render: (v: string | null) => v || t('成功'),
              },
              { title: t('重试次数'), dataIndex: 'attempt' },
            ]}
          />
        )}
      </Card>
    </Space>
  );
}
