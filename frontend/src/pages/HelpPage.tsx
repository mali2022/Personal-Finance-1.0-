import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Empty,
  Form,
  Input,
  List,
  Pagination,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useLocale } from '../i18n';
import { PageTitle } from '../components/PageTitle';
import { ErrorState } from '../components/Feedback';
import { supportApi } from '../api/support';
export default function HelpPage() {
  const en = useLocale() === 'en';
  const text = (zh: string, english: string) => (en ? english : zh);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [tab, setTab] = useState('help');
  const [form] = Form.useForm();
  const cache = useQueryClient();
  const { message } = App.useApp();
  const tickets = useQuery({
    queryKey: ['support-tickets', page],
    queryFn: () => supportApi.tickets(page),
    enabled: tab === 'feedback',
  });
  const submit = useMutation({
    mutationFn: supportApi.submit,
    onSuccess: () => {
      form.resetFields();
      setPage(1);
      void cache.invalidateQueries({ queryKey: ['support-tickets'] });
      message.success(
        text(
          '反馈已提交，可在下方查看处理进度',
          'Feedback sent. Track progress below.',
        ),
      );
    },
  });
  const faqs = [
    [
      text('如何开始记账？', 'How do I start?'),
      text(
        '先在账户中添加银行卡、现金或钱包并核对期初余额，再点击“记一笔”录入收入、支出。分类用于统计收支。',
        'Add bank, cash or wallet accounts and verify opening balances, then use New entry to record income and expenses. Categories organize your reports.',
      ),
      '/accounts',
    ],
    [
      text(
        '充值、提现和转账如何记录？',
        'How do I record top-ups, withdrawals and transfers?',
      ),
      text(
        '使用对应入口，选择转出与转入账户。自有账户之间的本金移动不计收入或支出；手续费单独记为费用。',
        'Choose the matching entry type and source/destination accounts. Moving principal between your own accounts does not count as income or expenses; fees are separate expenses.',
      ),
      '/transactions',
    ],
    [
      text('如何批量导入账单？', 'How do I import statements?'),
      text(
        '进入导入中心下载模板，上传后核对账户、分类、金额及重复提示，预览确认后再导入。',
        'Download a template in Import, upload your file, review accounts, categories, amounts and duplicate warnings, then confirm.',
      ),
      '/import',
    ],
    [
      text('账户余额与实际不一致怎么办？', 'Why does my balance differ?'),
      text(
        '检查期初余额、遗漏流水、退款和转账方向，再使用账户对账功能核对。不要为凑余额重复录入收入。',
        'Check opening balances, missing entries, refunds and transfer direction, then use Reconciliation. Avoid duplicate income entries to force a balance.',
      ),
      '/reconciliation',
    ],
    [
      text('如何管理预算？', 'How do budgets work?'),
      text(
        '在预算页面设置分类月预算，在年度预算中规划全年额度，通过统计查看执行情况。',
        'Set monthly category budgets and annual allocations, then review progress in reports.',
      ),
      '/budgets',
    ],
    [
      text('如何保护隐私与查看更新？', 'How do I manage privacy and updates?'),
      text(
        '可在设置中隐藏金额，在 AI 与隐私中管理授权；版本更新页面提供更新内容及检查更新功能。反馈时请勿填写密码、密钥或完整账务信息。',
        'Hide amounts in Settings and manage consent in AI & Privacy. Release notes include update details and an update check. Do not include passwords, keys or complete financial records in feedback.',
      ),
      '/settings/updates',
    ],
  ];
  const statuses: Record<string, string> = {
    Open: text('待处理', 'Open'),
    InProgress: text('处理中', 'In progress'),
    Resolved: text('已解决', 'Resolved'),
  };
  return (
    <>
      <PageTitle>{text('帮助与反馈', 'Help & feedback')}</PageTitle>
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'help',
            label: text('使用帮助', 'Help'),
            children: (
              <Card>
                <Input.Search
                  allowClear
                  placeholder={text('搜索帮助', 'Search help')}
                  onChange={(e) => setKeyword(e.target.value)}
                  value={keyword}
                  style={{ marginBottom: 16 }}
                />
                <Collapse
                  items={faqs
                    .filter(([q, a]) =>
                      (q + a).toLowerCase().includes(keyword.toLowerCase()),
                    )
                    .map(([q, a, path]) => ({
                      key: path,
                      label: q,
                      children: (
                        <>
                          <p>{a}</p>
                          <Link to={path}>
                            {text('前往功能', 'Open feature')}
                          </Link>
                        </>
                      ),
                    }))}
                />
                {faqs.every(
                  ([q, a]) =>
                    !(q + a).toLowerCase().includes(keyword.toLowerCase()),
                ) && (
                  <Empty
                    description={text(
                      '没有匹配的帮助，可在反馈中提问',
                      'No matching help. Send us a question.',
                    )}
                  />
                )}
              </Card>
            ),
          },
          {
            key: 'feedback',
            label: text('反馈与进度', 'Feedback & progress'),
            children: (
              <Space
                direction="vertical"
                size="large"
                style={{ width: '100%' }}
              >
                <Card title={text('提交反馈', 'Send feedback')}>
                  <Alert
                    showIcon
                    type="info"
                    message={text(
                      '请描述操作步骤与预期结果，不要提交密码、密钥或敏感账务。管理员可查看你的反馈。',
                      'Describe the steps and expected result. Do not submit passwords, keys or sensitive financial records. Administrators can read your feedback.',
                    )}
                    style={{ marginBottom: 16 }}
                  />
                  <Form
                    form={form}
                    layout="vertical"
                    initialValues={{ kind: 'Question' }}
                    onFinish={(v) => submit.mutate(v)}
                  >
                    <Form.Item
                      name="kind"
                      label={text('反馈类型', 'Type')}
                      rules={[{ required: true }]}
                    >
                      <Select
                        options={[
                          {
                            value: 'Question',
                            label: text('使用咨询', 'Question'),
                          },
                          { value: 'Bug', label: text('问题反馈', 'Bug') },
                          {
                            value: 'Suggestion',
                            label: text('功能建议', 'Suggestion'),
                          },
                        ]}
                      />
                    </Form.Item>
                    <Form.Item
                      name="subject"
                      label={text('标题', 'Subject')}
                      rules={[{ required: true, whitespace: true, max: 120 }]}
                    >
                      <Input maxLength={120} showCount />
                    </Form.Item>
                    <Form.Item
                      name="content"
                      label={text('详细描述', 'Details')}
                      rules={[{ required: true, whitespace: true, max: 4000 }]}
                    >
                      <Input.TextArea rows={5} maxLength={4000} showCount />
                    </Form.Item>
                    {submit.isError && <ErrorState error={submit.error} />}
                    <Button
                      htmlType="submit"
                      type="primary"
                      loading={submit.isPending}
                    >
                      {text('提交反馈', 'Send feedback')}
                    </Button>
                  </Form>
                </Card>
                <Card
                  title={text('我的反馈', 'My feedback')}
                  extra={
                    <Button onClick={() => void tickets.refetch()}>
                      {text('刷新', 'Refresh')}
                    </Button>
                  }
                >
                  {tickets.isError ? (
                    <ErrorState
                      error={tickets.error}
                      retry={() => void tickets.refetch()}
                    />
                  ) : (
                    <List
                      loading={tickets.isPending}
                      dataSource={tickets.data?.items || []}
                      locale={{
                        emptyText: text('暂无反馈', 'No feedback yet'),
                      }}
                      renderItem={(x) => (
                        <List.Item>
                          <div
                            style={{ width: '100%', overflowWrap: 'anywhere' }}
                          >
                            <Space wrap>
                              <Typography.Text strong>
                                {x.subject}
                              </Typography.Text>
                              <Tag
                                color={
                                  x.status === 'Resolved' ? 'green' : 'blue'
                                }
                              >
                                {statuses[x.status]}
                              </Tag>
                              <Typography.Text type="secondary">
                                {new Date(x.createdAt).toLocaleString(
                                  en ? 'en' : 'zh-CN',
                                )}
                              </Typography.Text>
                            </Space>
                            <p style={{ whiteSpace: 'pre-wrap' }}>
                              {x.content}
                            </p>
                            {x.reply && (
                              <Alert
                                type="success"
                                message={text(
                                  '管理员回复',
                                  'Administrator reply',
                                )}
                                description={
                                  <span style={{ whiteSpace: 'pre-wrap' }}>
                                    {x.reply}
                                  </span>
                                }
                              />
                            )}
                          </div>
                        </List.Item>
                      )}
                    />
                  )}
                  <Pagination
                    current={page}
                    total={tickets.data?.total || 0}
                    pageSize={10}
                    showSizeChanger={false}
                    onChange={setPage}
                  />
                </Card>
              </Space>
            ),
          },
        ]}
      />
    </>
  );
}
