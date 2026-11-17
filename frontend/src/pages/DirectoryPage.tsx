import { usePreferredCurrency } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { TemplateImport } from '../components/TemplateImport';
import { MerchantMasterPanel } from '../features/imports/MerchantMasterPanel';
import { DateInput } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { localizedLabels } from '../i18n';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { ProjectAnalysis } from './ProjectAnalysis';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  Popconfirm,
  Space,
  Table,
  Tag,
} from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { directoryApi } from '../api/business';
import { DirectoryDeleteDialog } from '../components/DirectoryDeleteDialog';
import type { DirectoryDeletionRequest } from '../api/deletion';
import { authApi } from '../api/client';
import { categoryApi } from '../api/finance';
import { formatDate } from '../utils/finance';
import { AccountSelector, CategorySelector } from '../components/Selectors';
import { ErrorState } from '../components/Feedback';
import { Money } from '../components/Money';
import { useUI } from '../stores/ui';
import type { ApiError, DirectoryRecord } from '../types';
const titles = localizedLabels({
  projects: '项目',
  merchants: '商户',
  tags: '标签',
  templates: '记账模板',
});
export default function DirectoryPage() {
  useLocale();
  const preferredCurrency = usePreferredCurrency();
  const [analysis, setAnalysis] = useState<DirectoryRecord>();
  const kind = useLocation().pathname.slice(1) as DirectoryRecord['kind'];
  const session = useQuery({
    queryKey: ['session'],
    queryFn: authApi.me,
    staleTime: Infinity,
  });
  const [selection, setSelection] = useState<{
    kind?: string;
    user?: string;
    rows: Record<string, DirectoryRecord>;
  }>({ rows: {} });
  const selected =
    selection.kind === kind && selection.user === session.data?.id
      ? selection.rows
      : {};
  const [deleting, setDeleting] = useState<{
    kind: string;
    user?: string;
    request: DirectoryDeletionRequest;
  }>();
  const canDelete =
    kind === 'merchants' || kind === 'tags' || kind === 'projects';
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [tagGroup, setTagGroup] = useState<string>();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DirectoryRecord>();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<DirectoryRecord>();
  const cache = useQueryClient();
  const { message } = App.useApp();
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  const q = useQuery({
    queryKey: [
      'directory',
      kind,
      keyword,
      page,
      kind === 'tags' ? tagGroup : undefined,
    ],
    queryFn: () =>
      directoryApi.list(
        kind,
        keyword,
        page,
        kind === 'tags' ? tagGroup : undefined,
      ),
  });
  const importDefaults = useMutation({
    mutationFn: () => directoryApi.importDefaultTags(crypto.randomUUID()),
    onSuccess: (result) => {
      void cache.invalidateQueries({ queryKey: ['directory', 'tags'] });
      message.success(
        `已补充 ${result.imported} 个默认标签，保留 ${result.skipped} 个已有同名标签。`,
      );
    },
    onError: (error: ApiError) => message.error(error.message),
  });
  const mutation = useMutation({
    mutationFn: (body: DirectoryRecord) =>
      directoryApi.save(
        {
          ...body,
          kind,
          id: editing?.id || '',
          version: editing?.version || '0',
          spent: '0',
          transactionCount: 0,
        },
        editing?.id,
      ),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['directory'] });
      setOpen(false);
      message.success(tr('已保存'));
    },
    onError: (e: ApiError) => message.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (record: DirectoryRecord) =>
      directoryApi.remove(kind, record.id, record.version),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['directory'] });
      setSelection({ rows: {} });
      setPage(1);
      message.success(tr('已删除'));
    },
    onError: (e: ApiError) => message.error(e.message),
  });
  const edit = (record?: DirectoryRecord) => {
    setEditing(record);
    form.resetFields();
    form.setFieldsValue(
      record || { currency: preferredCurrency, budget: '0', status: 'Active' },
    );
    setOpen(true);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{titles[kind]}</PageTitle>
        </div>
        {(kind === 'merchants' || kind === 'projects') && (
          <TemplateImport key={kind} kind={kind} />
        )}
        {kind === 'merchants' && <MerchantMasterPanel />}
        <Button type="primary" onClick={() => edit()}>
          {tr('新增')}
          {titles[kind]}
        </Button>
        {kind === 'tags' && (
          <Button
            loading={importDefaults.isPending}
            onClick={() => importDefaults.mutate()}
          >
            补充默认标签库
          </Button>
        )}
      </div>
      <Space className="mb16" wrap>
        {kind === 'tags' && (
          <Select
            aria-label="默认标签分组"
            placeholder="按默认标签分组筛选"
            style={{ minWidth: 260 }}
            allowClear
            value={tagGroup}
            onChange={(value) => {
              setTagGroup(value);
              setPage(1);
            }}
            options={
              q.data?.defaultLibrary?.groups.map((group, index) => ({
                value: group,
                label: `${String(index * 20 + 1).padStart(3, '0')}—${String((index + 1) * 20).padStart(3, '0')} ${group}`,
              })) || []
            }
          />
        )}
        <Input.Search
          aria-label={tr('搜索名称')}
          placeholder={
            kind === 'tags' ? '按编号、名称或分组搜索' : tr('按名称搜索')
          }
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
          allowClear
        />
      </Space>
      {canDelete && (
        <Space wrap className="mb16">
          <span>
            {tr('已选择 {0} 条（跨页保留）', Object.keys(selected).length)}
          </span>
          <Button
            danger
            disabled={!Object.keys(selected).length || remove.isPending}
            onClick={() =>
              setDeleting({
                kind,
                user: session.data?.id,
                request: {
                  items: Object.values(selected).map(({ id, version }) => ({
                    id,
                    version,
                  })),
                },
              })
            }
          >
            {tr('批量删除')}
          </Button>
          <Button
            danger
            disabled={q.isFetching || q.isError || remove.isPending}
            onClick={() =>
              setDeleting({
                kind,
                user: session.data?.id,
                request: { items: [], all: true },
              })
            }
          >
            {tr('全部删除')}
          </Button>
          <Button
            disabled={!Object.keys(selected).length}
            onClick={() => setSelection({ rows: {} })}
          >
            {tr('清空选择')}
          </Button>
        </Space>
      )}
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <Card>
          <Table<DirectoryRecord>
            rowKey="id"
            loading={q.isPending}
            dataSource={q.data?.items}
            rowSelection={
              canDelete
                ? {
                    selectedRowKeys: Object.keys(selected),
                    preserveSelectedRowKeys: true,
                    onChange: (keys) => {
                      const rows: Record<string, DirectoryRecord> = {};
                      for (const key of keys) {
                        const row =
                          q.data?.items.find((x) => x.id === key) ||
                          selected[String(key)];
                        if (row) rows[String(key)] = row;
                      }
                      setSelection({ kind, user: session.data?.id, rows });
                    },
                  }
                : undefined
            }
            scroll={{ x: 700 }}
            locale={{ emptyText: <Empty description={tr('暂无记录')} /> }}
            pagination={{
              current: page,
              pageSize: 100,
              total: q.data?.total,
              onChange: setPage,
              showSizeChanger: false,
            }}
            columns={[
              ...(kind === 'tags'
                ? [
                    {
                      title: '默认编号',
                      dataIndex: 'defaultCode',
                      render: (value: unknown) =>
                        value == null ? '—' : String(value),
                    },
                    {
                      title: '默认分组',
                      dataIndex: 'defaultGroup',
                      render: (value: unknown) =>
                        value == null ? '自定义标签' : String(value),
                    },
                  ]
                : []),
              {
                title: tr('名称'),
                dataIndex: 'name',
                render: (value: unknown) => (
                  <Sensitive>{value == null ? '—' : String(value)}</Sensitive>
                ),
              },
              { title: tr('币种'), dataIndex: 'currency' },
              ...(kind === 'merchants'
                ? [
                    {
                      title: tr('默认分类'),
                      render: (_: unknown, r: DirectoryRecord) =>
                        categories.data?.find((c) => c.id === r.categoryId)
                          ?.name || '—',
                    },
                    {
                      title: tr('最近消费'),
                      render: (_: unknown, r: DirectoryRecord) =>
                        r.lastTransactionAt
                          ? formatDate(r.lastTransactionAt)
                          : '—',
                    },
                  ]
                : []),
              ...(kind === 'projects'
                ? [
                    {
                      title: tr('预算'),
                      render: (_: unknown, r: DirectoryRecord) => (
                        <Money value={r.budget} currency={r.currency} />
                      ),
                    },
                    {
                      title: tr('剩余预算'),
                      render: (_: unknown, r: DirectoryRecord) => (
                        <ProjectRemaining record={r} />
                      ),
                    },
                    {
                      title: tr('起止日期'),
                      render: (_: unknown, r: DirectoryRecord) =>
                        `${r.startDate || '—'} 至 ${r.endDate || '未设置'}`,
                    },
                  ]
                : []),
              {
                title: kind === 'templates' ? tr('预设金额') : tr('净消费'),
                render: (_, r) => (
                  <Money
                    value={kind === 'templates' ? r.amount || '0' : r.spent}
                    currency={r.currency}
                  />
                ),
              },
              { title: tr('交易数'), dataIndex: 'transactionCount' },
              {
                title: tr('状态'),
                render: (_, r) => (
                  <Tag>
                    {r.status === 'Active'
                      ? tr('启用')
                      : r.status === 'Completed'
                        ? tr('已完成')
                        : tr('停用')}
                  </Tag>
                ),
              },
              {
                title: tr('操作'),
                render: (_, r) => (
                  <Space>
                    <Button type="link" onClick={() => edit(r)}>
                      {tr('编辑')}
                    </Button>
                    {kind === 'projects' && (
                      <Button type="link" onClick={() => setAnalysis(r)}>
                        {tr('项目分析')}
                      </Button>
                    )}
                    {kind !== 'templates' ? (
                      <Button
                        type="link"
                        onClick={() =>
                          navigate(
                            `/transactions?${kind === 'projects' ? 'projectId=' + r.id : kind === 'tags' ? 'tagId=' + r.id : 'keyword=' + encodeURIComponent(r.name)}&currency=${r.currency}`,
                          )
                        }
                      >
                        {tr('交易明细')}
                      </Button>
                    ) : (
                      <Button
                        disabled={r.status !== 'Active'}
                        onClick={() => {
                          useUI.getState().setTemplate(r);
                        }}
                      >
                        {tr('使用模板')}
                      </Button>
                    )}
                    {canDelete && (
                      <Popconfirm
                        title={tr('删除后不可恢复。')}
                        description={
                          kind === 'merchants'
                            ? r.transactionCount > 0
                              ? tr(
                                  '已有 {0} 笔历史交易使用该商户名称；删除后这些交易仍保留该名称，商户不再出现在目录与选择器中。',
                                  r.transactionCount,
                                )
                              : tr('该商户尚未被交易使用。')
                            : r.transactionCount > 0
                              ? tr(
                                  '该记录已用于 {0} 笔交易；若仍被交易或规则引用，删除会被拒绝，可改为停用。',
                                  r.transactionCount,
                                )
                              : tr('删除会检查交易、规则及历史记录的引用。')
                        }
                        okText={tr('删除')}
                        cancelText={tr('取消')}
                        okButtonProps={{ danger: true }}
                        onConfirm={() => remove.mutate(r)}
                      >
                        <Button
                          type="link"
                          danger
                          loading={
                            remove.isPending && remove.variables?.id === r.id
                          }
                        >
                          {tr('删除')}
                        </Button>
                      </Popconfirm>
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      )}
      {deleting?.kind === kind && deleting.user === session.data?.id && (
        <DirectoryDeleteDialog
          kind={kind}
          request={deleting.request}
          onClose={() => setDeleting(undefined)}
          onCompleted={() => {
            setSelection({ rows: {} });
            setPage(1);
          }}
        />
      )}
      <Drawer
        open={!!analysis}
        width="min(720px,100vw)"
        title={<Sensitive>{analysis?.name}</Sensitive>}
        onClose={() => setAnalysis(undefined)}
      >
        {analysis && <ProjectAnalysis project={analysis} />}
      </Drawer>
      <Drawer
        open={open}
        title={`${editing ? '编辑' : '新增'}${titles[kind]}`}
        width="min(460px, 100vw)"
        onClose={() => !mutation.isPending && setOpen(false)}
        extra={
          <Button
            type="primary"
            loading={mutation.isPending}
            onClick={() => form.submit()}
          >
            {tr('保存')}
          </Button>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) => mutation.mutate(v)}
        >
          <Form.Item
            name="name"
            label={tr('名称')}
            rules={[
              { required: true, whitespace: true, message: tr('请输入名称') },
            ]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="currency"
            label={tr('统计币种')}
            rules={[{ required: true }]}
          >
            <Select
              options={CURRENCY_CODES.map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          {kind === 'projects' && (
            <>
              <Form.Item
                name="budget"
                label={tr('项目预算')}
                rules={[{ required: true }]}
              >
                <Input inputMode="decimal" />
              </Form.Item>
              <Form.Item name="startDate" label={tr('开始日期')}>
                <DateInput type="date" />
              </Form.Item>
              <Form.Item name="endDate" label={tr('结束日期')}>
                <DateInput type="date" />
              </Form.Item>
            </>
          )}
          {(kind === 'merchants' || kind === 'templates') && (
            <Form.Item
              name="categoryId"
              label={tr('默认分类')}
              rules={[{ required: kind === 'templates' }]}
            >
              <CategorySelector
                kind={kind === 'merchants' ? 'All' : 'Expense'}
              />
            </Form.Item>
          )}
          {kind === 'templates' && (
            <>
              <Form.Item
                name="accountId"
                label={tr('默认账户')}
                rules={[{ required: true }]}
              >
                <AccountSelector />
              </Form.Item>
              <Form.Item
                name="amount"
                label={tr('默认金额')}
                rules={[{ required: true }]}
              >
                <Input inputMode="decimal" />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="status"
            label={tr('状态')}
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'Active', label: tr('启用') },
                { value: 'Disabled', label: tr('停用') },
                ...(kind === 'projects'
                  ? [{ value: 'Completed', label: tr('已完成') }]
                  : []),
              ]}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
}
import { decimal, minor } from '../utils/finance';
function ProjectRemaining({ record }: { record: DirectoryRecord }) {
  return (
    <Money
      value={decimal(minor(record.budget) - minor(record.spent))}
      currency={record.currency}
    />
  );
}
