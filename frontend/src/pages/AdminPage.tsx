import { InvitationManagement } from '../features/admin/InvitationManagement';
import { useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Drawer,
  Form,
  Input,
  List,
  Pagination,
  Popconfirm,
  Result,
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../api/client';
import { supportApi, type Ticket } from '../api/support';
import { useLocale } from '../i18n';
import { PageTitle } from '../components/PageTitle';
import { ErrorState } from '../components/Feedback';
export default function AdminPage() {
  const en = useLocale() === 'en';
  const text = (zh: string, english: string) => (en ? english : zh);
  const session = useQuery({ queryKey: ['session'], queryFn: authApi.me });
  const allowed = session.data?.permissions.includes('admin:manage') === true;
  const [tab, setTab] = useState('tickets');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [keyword, setKeyword] = useState('');
  const [selected, setSelected] = useState<Ticket>();
  const [form] = Form.useForm();
  const cache = useQueryClient();
  const { message } = App.useApp();
  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: supportApi.overview,
    enabled: allowed,
  });
  const users = useQuery({
    queryKey: ['admin', 'users', page, keyword],
    queryFn: () => supportApi.users(page, keyword),
    enabled: allowed && tab === 'users',
  });
  const tickets = useQuery({
    queryKey: ['admin', 'tickets', page, status, keyword],
    queryFn: () => supportApi.adminTickets(page, status, keyword),
    enabled: allowed && tab === 'tickets',
  });
  const audit = useQuery({
    queryKey: ['admin', 'audit', page],
    queryFn: () => supportApi.audit(page),
    enabled: allowed && tab === 'audit',
  });
  const refresh = () => void cache.invalidateQueries({ queryKey: ['admin'] });
  const revoke = useMutation({
    mutationFn: supportApi.revoke,
    onSuccess: () => {
      refresh();
      message.success(text('该用户会话已撤销', 'User sessions revoked'));
    },
  });
  const reply = useMutation({
    mutationFn: (body: { status: string; reply: string }) =>
      supportApi.reply(selected!, body),
    onSuccess: () => {
      setSelected(undefined);
      refresh();
      message.success(text('处理结果已保存', 'Response saved'));
    },
  });
  const statuses: Record<string, string> = {
    Open: text('待处理', 'Open'),
    InProgress: text('处理中', 'In progress'),
    Resolved: text('已解决', 'Resolved'),
  };
  const options = Object.entries(statuses).map(([value, label]) => ({
    value,
    label,
  }));
  const date = (v: string) => new Date(v).toLocaleString(en ? 'en' : 'zh-CN');
  if (session.isPending) return <Skeleton active />;
  if (session.isError) return <ErrorState error={session.error} />;
  if (!allowed)
    return (
      <Result
        status="403"
        title={text('仅管理员可访问后台', 'Administrator access required')}
      />
    );
  return (
    <>
      <PageTitle>{text('后台管理', 'Administration')}</PageTitle>
      {overview.isError && (
        <ErrorState error={overview.error} retry={refresh} />
      )}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {[
          [text('用户总数', 'Users'), overview.data?.users],
          [text('有效会话', 'Active sessions'), overview.data?.activeSessions],
          [
            text('待处理反馈', 'Unresolved feedback'),
            overview.data?.openTickets,
          ],
          [
            text('已解决反馈', 'Resolved feedback'),
            overview.data?.resolvedTickets,
          ],
        ].map(([label, value]) => (
          <Col xs={12} lg={6} key={String(label)}>
            <Card loading={overview.isPending}>
              <Statistic title={label} value={value ?? '—'} />
            </Card>
          </Col>
        ))}
      </Row>
      <Card
        extra={<Button onClick={refresh}>{text('刷新', 'Refresh')}</Button>}
      >
        <Tabs
          activeKey={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
            setKeyword('');
          }}
          items={[
            { key: 'invitations', label: text('邀请码管理', 'Invitations') },
            { key: 'tickets', label: text('反馈处理', 'Feedback') },
            { key: 'users', label: text('用户管理', 'Users') },
            { key: 'audit', label: text('操作记录', 'Activity log') },
          ]}
        />
        {tab === 'invitations' && <InvitationManagement />}
        {tab !== 'audit' && tab !== 'invitations' && (
          <Space wrap style={{ marginBottom: 16 }}>
            <Input.Search
              allowClear
              placeholder={text('搜索', 'Search')}
              key={tab}
              onSearch={(v) => {
                setKeyword(v);
                setPage(1);
              }}
            />
            {tab === 'tickets' && (
              <Select
                aria-label={text('反馈状态', 'Feedback status')}
                value={status}
                options={[
                  { value: '', label: text('全部状态', 'All statuses') },
                  ...options,
                ]}
                style={{ minWidth: 140 }}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
              />
            )}
          </Space>
        )}
        {revoke.isError && <ErrorState error={revoke.error} />}
        {tab === 'tickets' &&
          (tickets.isError ? (
            <ErrorState error={tickets.error} retry={refresh} />
          ) : (
            <List
              loading={tickets.isPending}
              dataSource={tickets.data?.items || []}
              locale={{ emptyText: text('暂无反馈', 'No feedback') }}
              renderItem={(x) => (
                <List.Item
                  actions={[
                    <Button
                      key="reply"
                      onClick={() => {
                        reply.reset();
                        setSelected(x);
                        form.setFieldsValue({
                          status: x.status,
                          reply: x.reply,
                        });
                      }}
                    >
                      {text('查看并处理', 'Review')}
                    </Button>,
                  ]}
                >
                  <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <strong>{x.subject}</strong> <Tag>{statuses[x.status]}</Tag>
                    <p>{date(x.createdAt)}</p>
                    <p>
                      {text('提交者 ID', 'Submitter ID')}: {x.userId}
                    </p>
                  </div>
                </List.Item>
              )}
            />
          ))}
        {tab === 'users' &&
          (users.isError ? (
            <ErrorState error={users.error} retry={refresh} />
          ) : (
            <Table
              rowKey="id"
              loading={users.isPending}
              dataSource={users.data?.items || []}
              pagination={false}
              scroll={{ x: 700 }}
              columns={[
                { title: text('用户', 'User'), dataIndex: 'displayName' },
                { title: text('邮箱', 'Email'), dataIndex: 'email' },
                {
                  title: text('角色', 'Role'),
                  dataIndex: 'isAdmin',
                  render: (v: boolean) =>
                    v ? text('管理员', 'Administrator') : text('用户', 'User'),
                },
                {
                  title: text('注册时间', 'Joined'),
                  dataIndex: 'createdAt',
                  render: date,
                },
                {
                  title: text('有效会话', 'Sessions'),
                  dataIndex: 'activeSessions',
                },
                {
                  title: text('操作', 'Actions'),
                  render: (_, u) => (
                    <Popconfirm
                      title={text(
                        '撤销此用户的全部会话？用户需要重新登录。',
                        'Revoke all sessions? The user will need to sign in again.',
                      )}
                      onConfirm={() => revoke.mutateAsync(u.id)}
                    >
                      <Button
                        danger
                        disabled={
                          u.id === session.data?.id || u.activeSessions === 0
                        }
                        loading={revoke.isPending}
                      >
                        {text('撤销会话', 'Revoke sessions')}
                      </Button>
                    </Popconfirm>
                  ),
                },
              ]}
            />
          ))}
        {tab === 'audit' &&
          (audit.isError ? (
            <ErrorState error={audit.error} retry={refresh} />
          ) : (
            <Table
              rowKey="id"
              loading={audit.isPending}
              dataSource={audit.data?.items || []}
              pagination={false}
              scroll={{ x: 700 }}
              columns={[
                {
                  title: text('时间', 'Time'),
                  dataIndex: 'createdAt',
                  render: date,
                },
                {
                  title: text('管理员 ID', 'Administrator ID'),
                  dataIndex: 'userId',
                },
                {
                  title: text('操作', 'Action'),
                  dataIndex: 'action',
                  render: (v: string) =>
                    v === 'ReplyTicket'
                      ? text('处理反馈', 'Reply to feedback')
                      : text('撤销会话', 'Revoke sessions'),
                },
                {
                  title: text('对象 ID', 'Resource ID'),
                  dataIndex: 'resourceId',
                },
              ]}
            />
          ))}
        <Pagination
          style={{ marginTop: 16 }}
          current={page}
          pageSize={10}
          showSizeChanger={false}
          total={
            (tab === 'tickets'
              ? tickets.data
              : tab === 'users'
                ? users.data
                : audit.data
            )?.total || 0
          }
          onChange={setPage}
        />
      </Card>
      <Drawer
        title={text('处理反馈', 'Review feedback')}
        open={!!selected}
        onClose={() => setSelected(undefined)}
        width={560}
        destroyOnHidden
      >
        {selected && (
          <>
            <h3>{selected.subject}</h3>
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {selected.content}
            </p>
            <p>
              {text('反馈类型', 'Type')}:{' '}
              {
                (
                  {
                    Question: text('使用咨询', 'Question'),
                    Bug: text('问题反馈', 'Bug'),
                    Suggestion: text('功能建议', 'Suggestion'),
                  } as Record<string, string>
                )[selected.kind]
              }
            </p>
            <Form
              form={form}
              layout="vertical"
              onFinish={(v) => reply.mutate(v)}
            >
              <Form.Item
                name="status"
                label={text('处理状态', 'Status')}
                rules={[{ required: true }]}
              >
                <Select options={options} />
              </Form.Item>
              <Form.Item
                name="reply"
                label={text('回复内容', 'Reply')}
                rules={[{ max: 4000 }]}
              >
                <Input.TextArea rows={7} maxLength={4000} showCount />
              </Form.Item>
              {reply.isError && (
                <>
                  <ErrorState error={reply.error} />
                  <Button
                    onClick={() => {
                      setSelected(undefined);
                      refresh();
                    }}
                  >
                    {text('关闭并刷新列表', 'Close and reload list')}
                  </Button>
                </>
              )}
              <Button
                htmlType="submit"
                type="primary"
                loading={reply.isPending}
              >
                {text('保存处理结果', 'Save response')}
              </Button>
            </Form>
          </>
        )}
      </Drawer>
    </>
  );
}
