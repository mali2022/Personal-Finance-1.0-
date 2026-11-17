import { Select } from '../components/TouchSelect';
import { localizedPair } from '../i18n';
import { t as tr, useLocale } from '../i18n';
import { PageTitle } from '../components/PageTitle';
import { useRef, useState } from 'react';
import { Alert, App, Button, Card, Drawer, Form, Input, InputNumber, Space, Table } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { annualApi, type AnnualInput } from '../api/financialPlanning';
import { categoryApi } from '../api/finance';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { minor, decimal } from '../utils/finance';
import { useUI } from '../stores/ui';
import type { Budget, SaveBudgetRequest } from '../types';
import BudgetHistorySnapshot from '../features/planning/BudgetHistorySnapshot';
import { useCopilotPageContext } from '../features/ai/copilotContext';

export default function AnnualBudgetsPage() {
  useLocale();
  const [year, setYear] = useState(new Date().getFullYear());
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ version: string; key: string }>();
  const [busy, setBusy] = useState(false);
  const [monthly, setMonthly] = useState<{
    month: number;
    annualVersion: string;
    monthlyVersion: string;
    before: Budget;
    draft: SaveBudgetRequest;
    key: string;
  }>();
  const [applyReason, setApplyReason] = useState('');
  const lock = useRef(false);
  const [form] = Form.useForm<AnnualInput>();
  const hidden = useUI((s) => s.hidden);
  const { message } = App.useApp();
  const cache = useQueryClient();
  const q = useQuery({
    queryKey: ['annualBudgets', year],
    queryFn: () => annualApi.get(year),
  });
  useCopilotPageContext({start:year+'-01-01',end:year+'-12-31',currency:q.data?.currency});
  const h = useQuery({
    queryKey: ['annualHistory', year, page],
    queryFn: () => annualApi.history(year, page),
  });
  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  const distribute = () => {
    try {
      const value = minor(form.getFieldValue('total'));
      if (value < 0n) throw new Error('请输入非负金额');
      const each = value / 12n;
      const rem = value % 12n;
      const existing = form.getFieldValue('allocations') || [];
      form.setFieldValue('allocations', [
        ...existing.filter((a: { categoryId: string | null }) => a.categoryId),
        ...Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          categoryId: null,
          amount: decimal(each + (BigInt(i) < rem ? 1n : 0n)),
        })),
      ]);
    } catch {
      message.error(tr("请先填写合法年度总额"));
    }
  };
  const submit = async () => {
    if (lock.current || !editing) return;
    lock.current = true;
    setBusy(true);
    try {
      const input = await form.validateFields();
      await annualApi.save(
        year,
        {
          ...input,
          currency: 'CNY',
          allocations: input.allocations.map((a) => ({
            month: a.month,
            categoryId: a.categoryId || null,
            amount: decimal(minor(a.amount)),
          })),
        },
        editing.version,
        editing.key,
      );
      await cache.invalidateQueries({ queryKey: ['annualBudgets'] });
      await cache.invalidateQueries({ queryKey: ['annualHistory'] });
      setEditing(undefined);
      message.success(tr("年度计划已保存"));
    } catch (e) {
      if (e && typeof e === 'object' && 'message' in e)
        message.error(String(e.message));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const open = () => {
    if (!q.data) return;
    form.setFieldsValue({
      total: q.data.total,
      state: q.data.state === 'Missing' ? 'Active' : q.data.state,
      currency: 'CNY',
      reason: '',
      allocations: q.data.allocations.map((a) => ({
        month: a.month,
        categoryId: a.categoryId,
        amount: a.amount,
      })),
    });
    setEditing({ version: q.data.version, key: crypto.randomUUID() });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{tr("年度预算")}</PageTitle>
        </div>
        <Space wrap>
          <InputNumber
            aria-label={tr("预算年度")}
            min={1900}
            max={9998}
            value={year}
            disabled={!!editing}
            onChange={(v) => {
              if (v) {
                setYear(v);
                setPage(1);
              }
            }}
          />
          <Button onClick={open} disabled={!q.data}>
            {tr("编辑年度计划")}</Button>
        </Space>
      </div>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <Card loading={q.isPending} className="mb16">
          <div className="summary-grid">
            {[
              ['年度额度', q.data?.total],
              ['已使用', q.data?.used],
              ['剩余额度', q.data?.remaining],
            ].map(([label, value]) => (
              <div key={label}>
                <span className="muted">{label}</span>
                <div className="stat-value">
                  <Money value={value || '0.00'} />
                </div>
              </div>
            ))}
          </div>
          <p>{q.data?.scope}</p>
          <p>
            {tr("年度执行率：")}{hidden
              ? '••••'
              : q.data?.executionPercent != null
                ? `${q.data.executionPercent}%`
                : tr("不适用")}
          </p>
          {q.data?.state === 'Missing' && (
            <Alert
              type="info"
              message={tr("尚未设置年度预算，可创建或复制上一年的计划。")}
            />
          )}
        </Card>
      )}
      <Card title={tr("月份分配与实际执行")} className="mb16">
        <Table
          rowKey="month"
          scroll={{ x: 700 }}
          pagination={false}
          dataSource={q.data?.months}
          columns={[
            { title: tr("月份"), dataIndex: 'month' },
            ...[
              localizedPair('allocated','年度分配'),
              localizedPair('monthlyBudget','已保存月预算'),
              localizedPair('used','实际费用'),
            ].map(([key, title]) => ({
              title,
              dataIndex: key,
              render: (v: string) => <Money value={v} />,
            })),
            {
              title: tr("月度草稿"),
              render: (_, r) => (
                <Button
                  disabled={busy || q.data?.state !== 'Active'}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const body = {
                        month: r.month,
                        annualVersion: q.data!.version,
                        monthlyVersion: r.monthlyVersion,
                        reason: '',
                      };
                      const p = await annualApi.monthlyPreview(year, body);
                      setMonthly({
                        ...p,
                        month: r.month,
                        annualVersion: body.annualVersion,
                        monthlyVersion: p.before.version,
                        key: crypto.randomUUID(),
                      });
                      setApplyReason('');
                    } catch (e) {
                      message.error(
                        e && typeof e === 'object' && 'message' in e
                          ? String(e.message)
                          : tr("预览失败"),
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {tr("预览差异")}</Button>
              ),
            },
          ]}
        />
      </Card>
      <Card title={tr("年度分类额度")} className="mb16">
        <Table
          rowKey={(r) => `${r.month}:${r.categoryId}`}
          pagination={false}
          dataSource={q.data?.allocations.filter((a) => a.month === 0)}
          scroll={{ x: 600 }}
          expandable={{
            expandedRowRender: (r) => (
              <Table
                scroll={{ x: 'max-content' }}
                rowKey="categoryId"
                pagination={false}
                dataSource={r.breakdown}
                columns={[
                  {
                    title: tr("实际记账分类"),
                    render: (_, item) =>
                      cats.data?.find((c) => c.id === item.categoryId)?.name ||
                      '历史分类',
                  },
                  {
                    title: tr("净费用"),
                    dataIndex: 'used',
                    render: (v) => <Money value={v} />,
                  },
                ]}
              />
            ),
            rowExpandable: (r) => (r.breakdown?.length || 0) > 0,
          }}
          columns={[
            {
              title: tr("分类"),
              render: (_, r) =>
                cats.data?.find((c) => c.id === r.categoryId)?.name ||
                '历史分类',
            },
            {
              title: tr("额度"),
              dataIndex: 'amount',
              render: (v) => <Money value={v} />,
            },
            {
              title: tr("实际费用"),
              dataIndex: 'used',
              render: (v) => <Money value={v || '0.00'} />,
            },
            {
              title: tr("剩余"),
              dataIndex: 'remaining',
              render: (v) => <Money value={v || '0.00'} />,
            },
            {
              title: tr("执行率"),
              dataIndex: 'executionPercent',
              render: (v) => (hidden ? '••••' : v != null ? `${v}%` : '不适用'),
            },
          ]}
        />
      </Card>
      <Card title={tr("调整历史")}>
        <Table
          scroll={{ x: 'max-content' }}
          rowKey="id"
          dataSource={h.data?.items}
          expandable={{
            expandedRowRender: (r) =>
              hidden ? (
                '••••'
              ) : (
                <Space direction="vertical">
                  <strong>{tr("修改前")}</strong>
                  <BudgetHistorySnapshot
                    value={r.beforeJson}
                    categoryName={(id) =>
                      cats.data?.find((c) => c.id === id)?.name || '历史分类'
                    }
                  />
                  <strong>{tr("修改后")}</strong>
                  <BudgetHistorySnapshot
                    value={r.afterJson}
                    categoryName={(id) =>
                      cats.data?.find((c) => c.id === id)?.name || '历史分类'
                    }
                  />
                </Space>
              ),
          }}
          pagination={{
            current: page,
            pageSize: 10,
            total: h.data?.total,
            onChange: setPage,
          }}
          columns={[
            {
              title: tr("时间"),
              dataIndex: 'createdAt',
              render: (v) => new Date(v).toLocaleString(),
            },
            {
              title: tr("原因"),
              dataIndex: 'reason',
              render: (v) => (hidden ? '••••' : v),
            },
            {
              title: tr("版本"),
              render: (_, r) => `${r.beforeVersion} → ${r.afterVersion}`,
            },
          ]}
        />
      </Card>
      <Drawer
        rootClassName="planning-drawer"
        title={tr("{0} 年度计划", year)}
        width={640}
        open={!!editing}
        onClose={() => !busy && setEditing(undefined)}
        extra={
          <Button type="primary" loading={busy} onClick={submit}>
            {tr("保存计划")}</Button>
        }
      >
        <Form form={form} layout="vertical" disabled={busy}>
          <Form.Item name="total" label={tr("年度总额")} rules={[{ required: true }]}>
            <Input inputMode="decimal" />
          </Form.Item>
          <Form.Item name="state" label={tr("状态")}>
            <Select
              options={[
                { value: 'Active', label: tr("生效") },
                { value: 'Archived', label: tr("归档") },
              ]}
            />
          </Form.Item>
          <Space wrap className="mb16">
            <Button onClick={distribute}>{tr("平均分配12个月")}</Button>
            <Button
              onClick={async () => {
                try {
                  const previous = await annualApi.get(year - 1);
                  form.setFieldsValue({
                    total: previous.total,
                    allocations: previous.allocations.map((a) => ({
                      month: a.month,
                      categoryId: a.categoryId,
                      amount: a.amount,
                    })),
                  });
                } catch {
                  message.error(tr("上一年计划加载失败"));
                }
              }}
            >
              {tr("复制上一年草稿")}</Button>
          </Space>
          <Button
            className="mb16"
            onClick={async () => {
              try {
                const suggestion = await annualApi.suggestion(
                  year,
                  decimal(minor(form.getFieldValue('total'))),
                );
                const previous = form.getFieldValue('allocations') || [];
                form.setFieldValue('allocations', [
                  ...previous.filter(
                    (a: { categoryId: string | null }) => a.categoryId,
                  ),
                  ...suggestion.allocations,
                ]);
                message.info(suggestion.scope);
              } catch {
                message.error(tr("历史建议生成失败，请检查总额"));
              }
            }}
          >
            {tr("按历史月份建议分配")}</Button>
          <Form.List name="allocations">
            {(fields, { add, remove }) => (
              <>
                {fields.map((f) => (
                  <Space key={f.key} align="start" wrap>
                    <Form.Item
                      name={[f.name, 'month']}
                      rules={[{ required: true }]}
                    >
                      <Select
                        style={{ width: 110 }}
                        options={[
                          { value: 0, label: tr("全年分类") },
                          ...Array.from({ length: 12 }, (_, i) => ({
                            value: i + 1,
                            label: tr("{0}月", i + 1),
                          })),
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name={[f.name, 'categoryId']}>
                      <Select
                        allowClear
                        placeholder={tr("总额度")}
                        style={{ width: 180 }}
                        options={cats.data
                          ?.filter(
                            (c) =>
                              c.kind === 'Expense' && c.status === 'Active',
                          )
                          .map((c) => ({ value: c.id, label: c.name }))}
                      />
                    </Form.Item>
                    <Form.Item
                      name={[f.name, 'amount']}
                      rules={[{ required: true }]}
                    >
                      <Input
                        style={{ width: 130 }}
                        inputMode="decimal"
                        placeholder={tr("额度")}
                      />
                    </Form.Item>
                    <Button onClick={() => remove(f.name)}>{tr("移除")}</Button>
                  </Space>
                ))}
                <Button
                  onClick={() =>
                    add({ month: 0, categoryId: null, amount: '0.00' })
                  }
                >
                  {tr("添加分配")}</Button>
              </>
            )}
          </Form.List>
          <Form.Item
            name="reason"
            label={tr("调整原因")}
            rules={[{ required: true }]}
          >
            <Input.TextArea maxLength={2000} />
          </Form.Item>
        </Form>
      </Drawer>
      <Drawer
        rootClassName="planning-drawer"
        title={tr("{0}-{1} 月度预算草稿", year, String(monthly?.month || 1).padStart(2, '0'))}
        width={520}
        open={!!monthly}
        onClose={() => !busy && setMonthly(undefined)}
      >
        {monthly && (
          <>
            <Alert
              className="mb16"
              message={
                <>
                  {tr("当前基础额度")}{' '}
                  <Money
                    value={monthly.before.baseTotal ?? monthly.before.total}
                  />{' '}
                  {tr("→ 新草稿")}<Money value={monthly.draft.total} />
                  {tr("。现有结转保持独立。")}</>
              }
            />
            <Table
              scroll={{ x: 'max-content' }}
              rowKey="categoryId"
              dataSource={monthly.draft.items}
              pagination={false}
              columns={[
                {
                  title: tr("分类"),
                  render: (_, r) =>
                    cats.data?.find((c) => c.id === r.categoryId)?.name,
                },
                {
                  title: tr("新额度"),
                  dataIndex: 'limit',
                  render: (v) => <Money value={v} />,
                },
              ]}
            />
            <Input.TextArea
              aria-label={tr("年度草稿应用原因")}
              value={applyReason}
              onChange={(e) => setApplyReason(e.target.value)}
              maxLength={2000}
              placeholder={tr("填写应用原因")}
            />
            <Button
              loading={busy}
              disabled={!applyReason.trim()}
              onClick={async () => {
                if (lock.current) return;
                lock.current = true;
                setBusy(true);
                try {
                  await annualApi.monthlyApply(
                    year,
                    {
                      month: monthly.month,
                      annualVersion: monthly.annualVersion,
                      monthlyVersion: monthly.monthlyVersion,
                      reason: applyReason,
                    },
                    monthly.key,
                  );
                  await Promise.all(
                    ['annualBudgets', 'budgets', 'dashboard'].map((key) =>
                      cache.invalidateQueries({ queryKey: [key] }),
                    ),
                  );
                  setMonthly(undefined);
                  message.success(tr("月度草稿已确认应用"));
                } catch (e) {
                  message.error(
                    e && typeof e === 'object' && 'message' in e
                      ? String(e.message)
                      : tr("应用失败"),
                  );
                } finally {
                  lock.current = false;
                  setBusy(false);
                }
              }}
            >
              {tr("确认替换本月基础预算")}</Button>
          </>
        )}
      </Drawer>
    </>
  );
}
