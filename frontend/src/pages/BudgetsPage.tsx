import { DatePicker } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import {
  categoryActive,
  categoryLabel as fullCategoryLabel,
  categoriesOverlap,
} from '../utils/categories';
import { t as tr, useLocale } from '../i18n';
import { LoadingState } from '../components/LoadingState';
import { PageTitle } from '../components/PageTitle';
import { useRef, useState } from 'react';
import { App, Alert, Button, Card, Form, Input, Modal, Progress, Space, Tag } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { budgetApi, categoryApi } from '../api/finance';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { decimal, minor } from '../utils/finance';
import type { ApiError, SaveBudgetRequest } from '../types';
import BudgetPlanningPanel from '../features/planning/BudgetPlanningPanel';
import { useUI } from '../stores/ui';
import { useCopilotPageContext } from '../features/ai/copilotContext';
export default function BudgetsPage() {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  useCopilotPageContext({start:dayjs(month+'-01').format('YYYY-MM-DD'),end:dayjs(month+'-01').endOf('month').format('YYYY-MM-DD'),currency:'CNY'});
  const [editing, setEditing] = useState<{
    month: string;
    version: string;
  } | null>(null);
  const [form] = Form.useForm<SaveBudgetRequest>();
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const lock = useRef(false);
  const q = useQuery({
    queryKey: ['budgets', month],
    queryFn: () => budgetApi.get(month),
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  const save = useMutation({
    mutationFn: ({
      month: targetMonth,
      body,
    }: {
      month: string;
      body: SaveBudgetRequest;
    }) => budgetApi.save(targetMonth, body),
    onSuccess: async () => {
      await Promise.all(
        ['budgets', 'dashboard', 'annualBudgets', 'financialSummary'].map(
          (key) => cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      setEditing(null);
      message.success(tr('预算已保存'));
    },
    onError: (error: ApiError) => {
      message.error(error.message);
    },
    onSettled: () => {
      lock.current = false;
    },
  });
  const total = Form.useWatch('total', form);
  const items = Form.useWatch('items', form) || [];
  const categoryAvailable = (id: string) =>
    categories.data?.find((c) => c.id === id)?.kind === 'Expense' &&
    categoryActive(categories.data || [], id);
  const categoryLabel = (id: string) => {
    const name = fullCategoryLabel(categories.data || [], id) || '分类不可用';
    return categoryAvailable(id) ? name : `${name}（已停用）`;
  };
  const cancelEdit = () => {
    if (save.isPending || lock.current) return;
    if (!form.isFieldsTouched()) {
      setEditing(null);
      return;
    }
    modal.confirm({
      title: tr('放弃未保存的预算修改？'),
      content: tr('已保存的预算不会改变。'),
      okText: tr('放弃修改'),
      cancelText: tr('继续编辑'),
      onOk: () => setEditing(null),
    });
  };
  const overlaps = (ids: string[]) =>
    categoriesOverlap(categories.data || [], ids);
  let unallocated = '0.00';
  try {
    unallocated = decimal(
      minor(total || '0') -
        items.reduce((sum, item) => sum + minor(item.limit || '0'), 0n),
    );
  } catch {
    /* 编辑过程中的未完成金额 */
  }
  const submit = async () => {
    if (lock.current || !editing) return;
    lock.current = true;
    const snapshot = editing;
    try {
      const values = await form.validateFields();
      lock.current = true;
      save.mutate({
        month: snapshot.month,
        body: {
          ...values,
          total: decimal(minor(values.total)),
          items: values.items.map((item) => ({
            ...item,
            limit: decimal(minor(item.limit)),
          })),
          version: snapshot.version,
        },
      });
    } catch {
      lock.current = false;
    }
  };
  const rule = {
    validator: (_: unknown, v: string) => {
      try {
        if (minor(v) > 0n) return Promise.resolve();
      } catch {
        /* 未完成输入 */
      }
      return Promise.reject(new Error('请输入大于 0 的金额，最多两位小数'));
    },
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr('花得自在，也在计划之内')}</PageTitle>
        </div>
        <Space wrap>
          <DatePicker
            aria-label={tr('预算月份')}
            picker="month"
            value={dayjs(month)}
            allowClear={false}
            disabled={!!editing}
            onChange={(value) => value && setMonth(value.format('YYYY-MM'))}
          />
          <Button
            type="primary"
            disabled={
              !q.data || !categories.data || categories.isError || !!editing
            }
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                total: q.data!.baseTotal ?? q.data!.total,
                items: q.data!.items.map(
                  ({ categoryId, limit, baseLimit }) => ({
                    categoryId,
                    limit: baseLimit ?? limit,
                  }),
                ),
              });
              setEditing({ month, version: q.data!.version });
            }}
          >
            {q.data?.version === '0' ? tr('创建预算') : tr('编辑预算')}
          </Button>
        </Space>
      </div>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <Card className="mb16" title={tr('{0} 月度预算', month)}>
            <div className="summary-grid">
              {[
                { label: tr('预算总额'), value: q.data.total },
                { label: tr('已使用'), value: q.data.used },
                {
                  label: tr('剩余预算'),
                  value: decimal(minor(q.data.total) - minor(q.data.used)),
                },
              ].map((item) => (
                <div key={item.label}>
                  <span className="muted">{item.label}</span>
                  <div className="stat-value">
                    <Money value={item.value} />
                  </div>
                </div>
              ))}
            </div>
            {hidden ? (
              <p>{tr('预算执行率 ••••')}</p>
            ) : minor(q.data.total) > 0n ? (
              <Progress
                percent={Math.max(
                  0,
                  Math.round(
                    (Number(q.data.used) / Number(q.data.total)) * 100,
                  ),
                )}
              />
            ) : (
              <Alert
                type="info"
                message={tr('本月尚未设置预算，创建后即可查看执行率。')}
              />
            )}
          </Card>
          <div className="account-grid">
            {overlaps(q.data.items.map((item) => item.categoryId)) && (
              <Alert
                type="warning"
                message={tr(
                  '历史预算存在父子分类重叠；分类已使用金额不能相加。编辑时请保留其中一层。月度已使用金额不重复计算。',
                )}
              />
            )}
            {q.data.items.map((item) => {
              const percent = (Number(item.used) / Number(item.limit)) * 100;
              return (
                <Card
                  key={item.id}
                  title={
                    categories.data
                      ? categoryLabel(item.categoryId)
                      : tr('分类加载中')
                  }
                  extra={
                    hidden ? undefined : (
                      <Tag
                        color={
                          percent > 100
                            ? 'red'
                            : percent >= 80
                              ? 'orange'
                              : 'green'
                        }
                      >
                        {percent > 100
                          ? tr('⚠ 超预算')
                          : percent >= 80
                            ? tr('⚠ 接近预算')
                            : tr('✓ 正常')}
                      </Tag>
                    )
                  }
                >
                  <div className="stat-value">
                    <Money value={item.used} />
                  </div>
                  <p>
                    {tr('预算')}
                    <Money value={item.limit} /> {tr('· 剩余')}{' '}
                    <Money
                      value={decimal(minor(item.limit) - minor(item.used))}
                    />
                  </p>
                  {!hidden && (
                    <Progress percent={Math.max(0, Math.round(percent))} />
                  )}
                </Card>
              );
            })}
          </div>
          <BudgetPlanningPanel key={month} month={month} budget={q.data} />
        </>
      )}
      <Modal
        title={tr('{0} 预算计划', editing?.month ?? month)}
        width={620}
        open={!!editing}
        onCancel={cancelEdit}
        confirmLoading={save.isPending}
        onOk={submit}
        okText={tr('保存预算')}
        cancelText={tr('取消')}
      >
        <Form form={form} layout="vertical" disabled={save.isPending}>
          {categories.data &&
            items.some(
              (item) => item.categoryId && !categoryAvailable(item.categoryId),
            ) && (
              <Alert
                className="mb16"
                type="warning"
                message={tr(
                  '预算包含已停用或不可用分类。历史金额仍保留，请替换或移除这些分类后保存；移除预算明细不会删除历史交易。',
                )}
              />
            )}
          <Form.Item
            name="total"
            label={tr('月度预算总额')}
            rules={[{ required: true, message: tr('请输入总额') }, rule]}
          >
            <Input inputMode="decimal" prefix="¥" />
          </Form.Item>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <div className="split-row" key={field.key}>
                    <Form.Item
                      name={[field.name, 'categoryId']}
                      rules={[
                        { required: true, message: tr('请选择分类') },
                        {
                          validator: (_: unknown, id: string) =>
                            !id || categoryAvailable(id)
                              ? Promise.resolve()
                              : Promise.reject(
                                  new Error('请替换或移除已停用的分类'),
                                ),
                        },
                      ]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        aria-label={tr('预算分类 {0}', field.name + 1)}
                        options={categories.data
                          ?.filter(
                            (c) =>
                              categoryAvailable(c.id) ||
                              items.some((item) => item.categoryId === c.id),
                          )
                          .map((c) => ({
                            value: c.id,
                            label: categoryLabel(c.id),
                            disabled: !categoryAvailable(c.id),
                          }))}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'limit']}
                      rules={[
                        { required: true, message: tr('请输入金额') },
                        rule,
                      ]}
                    >
                      <Input
                        aria-label={tr('分类预算 {0}', field.name + 1)}
                        placeholder={tr('预算金额')}
                        inputMode="decimal"
                      />
                    </Form.Item>
                    <Button
                      onClick={() => remove(field.name)}
                      aria-label={tr('删除分类预算')}
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <Button
                  onClick={() => add({ limit: '', categoryId: undefined })}
                >
                  {tr('添加分类预算')}
                </Button>
              </>
            )}
          </Form.List>
          <p>
            {tr('未分配预算')}
            <Money value={unallocated} />
          </p>
          <Form.Item
            name="validation"
            dependencies={['total', 'items']}
            rules={[
              {
                validator: () => {
                  try {
                    const values: SaveBudgetRequest['items'] =
                      form.getFieldValue('items') || [];
                    if (
                      new Set(values.map((i) => i.categoryId)).size !==
                      values.length
                    )
                      throw new Error('分类预算不能重复');
                    if (overlaps(values.map((i) => i.categoryId)))
                      throw new Error(
                        '同月不能同时设置父分类及其子分类预算，请保留其中一层',
                      );
                    if (
                      values.reduce(
                        (sum, item) => sum + minor(item.limit || '0'),
                        0n,
                      ) > minor(form.getFieldValue('total') || '0')
                    )
                      throw new Error('分类预算合计不能超过月度总额');
                    return Promise.resolve();
                  } catch (e) {
                    return Promise.reject(e);
                  }
                },
              },
            ]}
          >
            <span />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
