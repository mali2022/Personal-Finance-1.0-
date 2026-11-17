import { useCurrencyState } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { Select } from '../components/TouchSelect';
import { useNavigate } from 'react-router-dom';
import {
  categoryActive,
  categoryPath,
  categoryLabel,
} from '../utils/categories';
import { categoryStatisticsApi } from '../api/categoryStatistics';
import { Money } from '../components/Money';
import { Sensitive } from '../components/Sensitive';
import { t as tr, useLocale } from '../i18n';
import { LoadingState } from '../components/LoadingState';
import { PageTitle } from '../components/PageTitle';
import { useState } from 'react';
import {
  App,
  Button,
  Card,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoryApi } from '../api/finance';
import { CategoryCsvToolbar } from '../features/categories/CategoryCsvToolbar';
import { ErrorState } from '../components/Feedback';
import type { ApiError, Category } from '../types';
export default function CategoriesPage() {
  useLocale();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [currency, setCurrency] = useCurrencyState();
  const [kind, setKind] = useState<'Expense' | 'Income'>('Expense');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState<Category>();
  const [creating, setCreating] = useState(false);
  const [working, setWorking] = useState(false);
  const [form] = Form.useForm<Category>();
  const cache = useQueryClient();
  const q = useQuery({ queryKey: ['categories'], queryFn: categoryApi.list });
  const overview = useQuery({
    queryKey: ['categoryOverview', currency],
    queryFn: () => categoryStatisticsApi.overview(currency),
  });
  const selectedParent = Form.useWatch('parentId', form);
  const save = useMutation({
    mutationFn: ({ body, id }: { body: Category; id?: string }) =>
      categoryApi.save(body, id),
    onSuccess: async () => {
      await cache.invalidateQueries();
      setEdit(undefined);
      message.success(tr('分类已保存'));
    },
    onError: async (e: ApiError) => {
      message.error(e.message);
      if (e.code === 'VERSION_CONFLICT') await cache.invalidateQueries();
    },
  });
  const open = (c?: Category, parentId?: string) => {
    const value = c || {
      id: '',
      name: '',
      kind,
      parentId,
      status: 'Active' as const,
      sortOrder: q.data?.length || 0,
      version: '0',
    };
    setCreating(!c);
    setEdit(value);
    form.resetFields();
    form.setFieldsValue(value);
  };
  if (q.isPending) return <LoadingState />;
  if (q.isError)
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  type Node = Category & { children?: Node[] };
  const parents = q.data.filter((c) => !c.parentId && c.kind === kind);
  const summaries = new Map(
    overview.data?.items.map((item) => [item.id, item.summary]),
  );
  const build = (parentId?: string, showAll = false): Node[] =>
    q.data
      .filter((c) => c.kind === kind && (c.parentId || undefined) === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .flatMap((c) => {
        const matches = showAll || !search || c.name.includes(search);
        const children = build(c.id, matches);
        if (!matches && !children.length) return [];
        return [{ ...c, children: children.length ? children : undefined }];
      });
  const tree = build();
  const reorder = async (category: Category, delta: number) => {
    if (working || save.isPending) return;
    const siblings = q.data
      .filter(
        (c) => c.parentId === category.parentId && c.kind === category.kind,
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex((c) => c.id === category.id),
      target = index + delta;
    if (target < 0 || target >= siblings.length) return;
    [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
    setWorking(true);
    try {
      await categoryApi.reorder(
        siblings.map((c) => ({ id: c.id, version: c.version })),
      );
      await cache.invalidateQueries();
    } catch (error) {
      message.error((error as ApiError).message);
      await cache.invalidateQueries();
    } finally {
      setWorking(false);
    }
  };
  const deleteCategory = async (c: Category) => {
    if (working || save.isPending) return;
    setWorking(true);
    try {
      const preview = await categoryApi.deletionPreview(c.id);
      if (!preview.canDelete) {
        modal.info({
          title: tr('分类仍被使用，不能删除'),
          content: (
            <>
              <p>{tr('历史记录需要保留分类引用，可改为停用。')}</p>
              {preview.references
                .filter((r) => r.count > 0)
                .map((r) => (
                  <p key={r.kind}>
                    {r.label}：{r.count}
                  </p>
                ))}
            </>
          ),
        });
        return;
      }
      modal.confirm({
        title: tr('删除分类“{0}”？', c.name),
        content: tr(
          '当前没有子分类或业务引用。删除后不能恢复此分类；确认时会重新检查引用和版本。',
        ),
        okText: tr('删除分类'),
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await categoryApi.remove(c.id, preview.version);
            await cache.invalidateQueries();
            message.success(tr('分类已删除'));
          } catch (error) {
            message.error((error as ApiError).message);
            await cache.invalidateQueries();
            throw error;
          }
        },
      });
    } catch (error) {
      message.error((error as ApiError).message);
    } finally {
      setWorking(false);
    }
  };
  const actions = (c: Category) => {
    const busy = working || save.isPending;
    const siblings = q.data
      .filter((x) => x.kind === c.kind && x.parentId === c.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const index = siblings.findIndex((x) => x.id === c.id);
    return (
      <Dropdown
        trigger={['click']}
        menu={{
          items: [
            { key: 'detail', label: tr('详情') },
            { key: 'edit', label: tr('修改'), disabled: busy },
            { key: 'up', label: tr('↑ 排序'), disabled: busy || index === 0 },
            {
              key: 'down',
              label: tr('↓ 排序'),
              disabled: busy || index === siblings.length - 1,
            },
            {
              key: 'status',
              label: c.status === 'Active' ? tr('停用') : tr('恢复'),
              disabled: busy,
            },
            ...(categoryPath(q.data, c.id).length < 3
              ? [
                  {
                    key: 'child',
                    label: c.parentId ? tr('＋ 三级分类') : tr('＋ 二级分类'),
                    disabled: busy || !categoryActive(q.data, c.id),
                  },
                ]
              : []),
            { type: 'divider' as const },
            { key: 'delete', label: tr('删除'), danger: true, disabled: busy },
          ],
          onClick: ({ key }) => {
            if (key === 'detail') navigate(`/categories/${c.id}`);
            if (key === 'edit') open(c);
            if (key === 'up') void reorder(c, -1);
            if (key === 'down') void reorder(c, 1);
            if (key === 'status')
              save.mutate({
                body: {
                  ...c,
                  status: c.status === 'Active' ? 'Disabled' : 'Active',
                },
                id: c.id,
              });
            if (key === 'child') open(undefined, c.id);
            if (key === 'delete') void deleteCategory(c);
          },
        }}
      >
        <Button size="small" aria-label={tr('分类操作：{0}', c.name)}>
          {tr('操作')} ▾
        </Button>
      </Dropdown>
    );
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr('让每笔消费有迹可循')}</PageTitle>
        </div>
        <Button type="primary" onClick={() => open()}>
          {tr('＋ 一级分类')}
        </Button>
      </div>
      <Card>
        <Tabs
          activeKey={kind}
          onChange={(v) => setKind(v as typeof kind)}
          items={[
            { key: 'Expense', label: tr('支出分类') },
            { key: 'Income', label: tr('收入分类') },
          ]}
        />
        <Input.Search
          aria-label={tr('搜索分类名称')}
          placeholder={tr('搜索分类名称')}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          className="mb16"
        />
        {parents.length === 0 && (
          <Empty description={tr('暂无分类，可新增一级分类')} />
        )}
        <Space wrap className="mb16">
          <Select
            aria-label={tr('统计币种')}
            value={currency}
            onChange={setCurrency}
            options={CURRENCY_CODES.map((value) => ({
              value,
              label: value,
            }))}
          />
          <Button
            onClick={() =>
              setExpanded(
                q.data
                  .filter(
                    (c) =>
                      c.kind === kind &&
                      q.data.some((child) => child.parentId === c.id),
                  )
                  .map((c) => c.id),
              )
            }
          >
            {tr('全部展开')}
          </Button>
          <Button onClick={() => setExpanded([])}>{tr('全部收起')}</Button>
          <CategoryCsvToolbar kind={kind} categories={q.data} />
        </Space>
        {overview.isError && (
          <ErrorState error={overview.error} retry={() => overview.refetch()} />
        )}
        <Table<Node>
          rowKey="id"
          dataSource={tree}
          pagination={false}
          scroll={{ x: 1000 }}
          expandable={{
            expandedRowKeys: search ? q.data.map((c) => c.id) : expanded,
            onExpandedRowsChange: (keys) => setExpanded(keys.map(String)),
          }}
          columns={[
            {
              title: tr('分类名称'),
              render: (_, c) => (
                <Button
                  type="text"
                  style={{ padding: 0 }}
                  aria-expanded={
                    c.children
                      ? search
                        ? true
                        : expanded.includes(c.id)
                      : undefined
                  }
                  onClick={() =>
                    c.children
                      ? setExpanded(
                          expanded.includes(c.id)
                            ? expanded.filter((id) => id !== c.id)
                            : [...expanded, c.id],
                        )
                      : navigate(`/categories/${c.id}`)
                  }
                >
                  <Sensitive>{c.name}</Sensitive>
                </Button>
              ),
            },
            {
              title: tr('层级'),
              render: (_, c) =>
                tr('{0}级分类', categoryPath(q.data, c.id).length),
            },
            {
              title: tr('状态'),
              render: (_, c) => (
                <Tag>
                  {categoryActive(q.data, c.id)
                    ? tr('启用')
                    : c.status === 'Active'
                      ? tr('上级已停用')
                      : tr('已停用')}
                </Tag>
              ),
            },
            {
              title: tr('累计净额'),
              render: (_, c) =>
                summaries.get(c.id) ? (
                  <Money
                    value={summaries.get(c.id)!.net}
                    currency={currency as string}
                  />
                ) : (
                  '—'
                ),
            },
            {
              title: tr('交易笔数'),
              render: (_, c) => (
                <Sensitive>{summaries.get(c.id)?.count ?? '—'}</Sensitive>
              ),
            },
            { title: tr('操作'), render: (_, c) => actions(c) },
          ]}
        />
      </Card>
      <Modal
        title={creating ? tr('新增分类') : tr('修改分类')}
        open={!!edit}
        onCancel={() => setEdit(undefined)}
        confirmLoading={save.isPending}
        onOk={() =>
          form.validateFields().then((value) =>
            save.mutate({
              body: { ...edit!, ...value },
              id: creating ? undefined : edit!.id,
            }),
          )
        }
      >
        <Form layout="vertical" form={form}>
          <Form.Item
            label={tr('分类名称')}
            name="name"
            rules={[{ required: true, message: tr('请输入名称') }]}
          >
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item name="parentId" label={tr('上级分类（留空为一级）')}>
            <Select
              disabled={!creating}
              allowClear
              showSearch
              optionFilterProp="label"
              options={q.data
                .filter(
                  (c) =>
                    c.kind === kind &&
                    categoryActive(q.data, c.id) &&
                    categoryPath(q.data, c.id).length < 3,
                )
                .map((c) => ({
                  value: c.id,
                  label: categoryLabel(q.data, c.id),
                }))}
            />
          </Form.Item>
          <p className="muted">
            {tr(
              '将创建或编辑 {0} 级分类。三级按需创建；已有分类保持原层级与历史交易。',
              selectedParent
                ? categoryPath(q.data, selectedParent).length + 1
                : 1,
            )}
          </p>
        </Form>
      </Modal>
    </>
  );
}