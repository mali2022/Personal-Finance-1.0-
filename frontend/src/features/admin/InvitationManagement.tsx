import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Pagination,
  Popconfirm,
  Tag,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { useLocale } from '../../i18n';
import { ErrorState } from '../../components/Feedback';
interface Invitation {
  id: string;
  boundEmail?: string;
  status: string;
  expiresAt: string;
  usedAt?: string;
  usedByUserId?: string;
  version: string;
}
export function InvitationManagement() {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const [page, setPage] = useState(1);
  const [code, setCode] = useState('');
  const cache = useQueryClient();
  const { message } = App.useApp();
  const q = useQuery({
    queryKey: ['admin', 'invitations', page],
    queryFn: () =>
      apiClient
        .get<{ data: { items: Invitation[]; total: number } }>(
          '/admin/invitations',
          { params: { page } },
        )
        .then((r) => r.data.data),
  });
  const create = useMutation({
    mutationFn: (v: { days: number; email?: string }) =>
      apiClient.post<{ data: { code: string } }>('/admin/invitations', {
        expiresAt: new Date(Date.now() + v.days * 86400000).toISOString(),
        email: v.email,
      }),
    onSuccess: (r) => {
      setCode(r.data.data.code);
      void cache.invalidateQueries({ queryKey: ['admin', 'invitations'] });
    },
    onError: (e: { message: string }) => message.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (row: Invitation) =>
      apiClient.post(
        `/admin/invitations/${row.id}/revoke`,
        {},
        { headers: { 'If-Match': row.version } },
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e: { message: string }) => message.error(e.message),
  });
  const statuses: Record<string, string> = {
    Active: t('有效', 'Active'),
    Used: t('已使用', 'Used'),
    Revoked: t('已撤销', 'Revoked'),
    Expired: t('已过期', 'Expired'),
  };
  const close = () => {
    setCode('');
    create.reset();
  };
  return (
    <Card title={t('邀请码管理', 'Invitation management')}>
      <Alert
        type="info"
        showIcon
        message={t(
          '邀请码单次使用，仅显示一次；关闭弹窗后无法恢复原码。请安全交付给受邀人。',
          'Invitations are single-use and shown only once. After closing, the original code cannot be recovered. Share it securely.',
        )}
      />
      <Form
        layout="vertical"
        initialValues={{ days: 7 }}
        onFinish={create.mutate}
        style={{ marginTop: 16 }}
      >
        <Form.Item
          name="email"
          label={t('绑定邮箱（选填）', 'Bound email (optional)')}
          rules={[{ type: 'email' }, { max: 256 }]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          name="days"
          label={t('有效天数', 'Valid for (days)')}
          rules={[{ required: true }]}
        >
          <InputNumber min={1} max={90} precision={0} />
        </Form.Item>
        <Button htmlType="submit" type="primary" loading={create.isPending}>
          {t('生成邀请码', 'Generate invitation')}
        </Button>
      </Form>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <List
          loading={q.isPending}
          dataSource={q.data?.items}
          renderItem={(row) => (
            <List.Item
              key={row.id}
              actions={
                row.status === 'Active'
                  ? [
                      <Popconfirm
                        key="revoke"
                        title={t(
                          '撤销后无法激活，确认撤销？',
                          'Revoke this invitation?',
                        )}
                        onConfirm={() => revoke.mutate(row)}
                      >
                        <Button danger loading={revoke.isPending}>
                          {t('撤销', 'Revoke')}
                        </Button>
                      </Popconfirm>,
                    ]
                  : []
              }
            >
              <List.Item.Meta
                title={
                  <>
                    {row.boundEmail || t('未绑定邮箱', 'Any email')}{' '}
                    <Tag>{statuses[row.status] || row.status}</Tag>
                  </>
                }
                description={
                  <div style={{ overflowWrap: 'anywhere' }}>
                    <div>ID: {row.id}</div>
                    <div>
                      {t('到期', 'Expires')}:{' '}
                      {new Date(row.expiresAt).toLocaleString()}
                    </div>
                    {row.usedAt && (
                      <div>
                        {t('使用时间', 'Used at')}:{' '}
                        {new Date(row.usedAt).toLocaleString()} ·{' '}
                        {row.usedByUserId}
                      </div>
                    )}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
      <Pagination
        current={page}
        pageSize={20}
        total={q.data?.total || 0}
        showSizeChanger={false}
        onChange={setPage}
      />
      <Modal
        open={!!code}
        title={t('请保存邀请码', 'Save this invitation')}
        footer={
          <Button onClick={close}>{t('我已保存，关闭', 'Saved, close')}</Button>
        }
        onCancel={close}
        destroyOnHidden
      >
        <p style={{ overflowWrap: 'anywhere', userSelect: 'all' }}>{code}</p>
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              message.success(t('已复制', 'Copied'));
            } catch {
              message.info(
                t(
                  '请手动选择并复制邀请码',
                  'Select and copy the code manually',
                ),
              );
            }
          }}
        >
          {t('复制邀请码', 'Copy invitation')}
        </Button>
      </Modal>
    </Card>
  );
}
