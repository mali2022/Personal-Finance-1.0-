import { TemplateImport } from '../components/TemplateImport';
import { DatePicker } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { localizedLabels } from '../i18n';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { PageTitle } from '../components/PageTitle';
import { useSearchParams } from 'react-router-dom';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Descriptions, Drawer, Empty, Form, Input, Space, Table, Tabs, Tag } from 'antd';
import dayjs from 'dayjs';
import { businessApi } from '../api/business';
import { accountApi } from '../api/finance';
import { AccountSelector } from '../components/Selectors';
import { ErrorState } from '../components/Feedback';
import { Money } from '../components/Money';
import { DebtPlanningPanel } from '../features/planning/DebtPlanningPanel';
import { TransactionTable } from '../features/transactions/TransactionTable';
import { TransactionDrawer } from '../features/transactions/TransactionDrawer';
import { minor, formatDate } from '../utils/finance';
import type { ApiError, BusinessRecord } from '../types';
const labels = localizedLabels({
  Draft: '待提交',
  Submitted: '已提交',
  Partial: '部分完成',
  Settled: '已结清',
  Abandoned: '不再报销',
});
interface Values {
  contractAccountId?: string;
  counterparty: string;
  accountId: string;
  amount: string;
  occurredAt: dayjs.Dayjs;
  note?: string;
}
export default function BusinessPage({
  reimbursement = false,
}: {
  reimbursement?: boolean;
}) {
  useLocale();
  const [params] = useSearchParams();
  const [kind, setKind] = useState<BusinessRecord['kind']>(
    reimbursement
      ? 'Reimbursement'
      : params.get('direction') === 'Borrowed'
        ? 'Borrowed'
        : 'Lent',
  );
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    params.get('id') || undefined,
  );
  const [mode, setMode] = useState<'create' | 'settle'>();
  const [transactionId, setTransactionId] = useState<string>();
  const [form] = Form.useForm<Values>();
  const accounts=useQuery({queryKey:['accounts'],queryFn:accountApi.list});
  const cache = useQueryClient();
  const { message, modal } = App.useApp();
  const lock = useRef(false);
  const key = useRef(crypto.randomUUID());
  const fingerprint = useRef('');
  const q = useQuery({
    queryKey: ['business', kind, page],
    queryFn: () => businessApi.list(kind, page),
  });
  const selectedQuery = useQuery({
    queryKey: ['business', 'detail', selectedId],
    queryFn: () => businessApi.detail(selectedId!),
    enabled: !!selectedId,
  });
  const selected = selectedQuery.data;
  const refresh = () => {
    for (const name of [
      'business',
      'accounts',
      'dashboard',
      'transactions',
      'reports',
      'budgets',
      'debt-plans',
      'planningSummary',
      'calendarEvents',
    ])
      void cache.invalidateQueries({ queryKey: [name] });
  };
  const mutation = useMutation({
    mutationFn: async (v: Values) => {
      const body = {
        ...v,
        occurredAt: v.occurredAt.toISOString(),
        note: v.note || '',
      };
      const next = JSON.stringify({ body, id: selected?.id, mode });
      if (fingerprint.current !== next) {
        fingerprint.current = next;
        key.current = crypto.randomUUID();
      }
      return mode === 'settle' && selected
        ? businessApi.settle(
            selected.id,
            { ...body, version: selected.version },
            key.current,
          )
        : businessApi.create({ ...body, kind }, key.current);
    },
    onSuccess: () => {
      refresh();
      setMode(undefined);
      message.success(tr("已保存"));
    },
    onError: (e: ApiError) => message.error(e.message),
    onSettled: () => {
      lock.current = false;
    },
  });
  const remove = useMutation({
    mutationFn: (record: BusinessRecord) => businessApi.remove(record.id, record.version),
    onSuccess: () => { refresh(); setSelectedId(undefined); message.success(tr('已删除')); },
    onError: (e: ApiError) => message.error(e.message),
  });
  const confirmDelete = (record: BusinessRecord) => modal.confirm({
    title: tr('删除这笔借贷？'),
    content: tr('将同时撤销本金和关联还款记录，并重新计算资金账户及应收、应付余额。'),
    okText: tr('确认删除'), cancelText: tr('取消'), okButtonProps: { danger: true },
    onOk: () => remove.mutateAsync(record),
  });
  const open = (next: 'create' | 'settle') => {
    key.current = crypto.randomUUID();
    fingerprint.current = '';
    form.resetFields();
    form.setFieldsValue({
      occurredAt: dayjs(),
      contractAccountId: next === 'create' ? params.get('contractAccountId') || undefined : undefined,
      note: '',
      amount: next === 'settle' ? selected?.outstanding : undefined,
    });
    setMode(next);
  };
  const title = reimbursement ? '报销管理' : '借出与借入';
  const receive = kind !== 'Borrowed';
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{title}</PageTitle>
        </div>
        {!reimbursement && <TemplateImport kind="loans" />}
        <Button type="primary" onClick={() => open('create')}>
          {reimbursement
            ? tr("新增垫付")
            : kind === 'Lent'
              ? tr("新增借出")
              : tr("新增借入")}
        </Button>
      </div>
      {!reimbursement && (
        <Tabs
          activeKey={kind}
          onChange={(v) => {
            setKind(v as BusinessRecord['kind']);
            setPage(1);
            setSelectedId(undefined);
          }}
          items={[
            { key: 'Lent', label: tr("借出 · 别人欠我") },
            { key: 'Borrowed', label: tr("借入 · 我欠别人") },
          ]}
        />
      )}
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <Card>
          <Table<BusinessRecord>
            rowKey="id"
            loading={q.isPending}
            dataSource={q.data?.items}
            scroll={{ x: 850 }}
            locale={{
              emptyText: (
                <Empty description={tr("暂无记录")}>
                  <Button onClick={() => open('create')}>{tr("创建第一笔")}</Button>
                </Empty>
              ),
            }}
            pagination={{
              current: page,
              pageSize: 20,
              total: q.data?.total,
              onChange: setPage,
              showSizeChanger: false,
            }}
            columns={[
              {
                title: reimbursement
                  ? tr("报销对象")
                  : receive
                    ? tr("借给谁")
                    : tr("向谁借"),
                dataIndex: 'counterparty',
                render: (value: unknown) => (
                  <Sensitive>{value == null ? '—' : String(value)}</Sensitive>
                ),
              },
              { title: tr("日期"), render: (_, r) => formatDate(r.occurredAt) },
              {
                title: reimbursement ? tr("垫付金额") : tr("本金"),
                render: (_, r) => (
                  <Money value={r.principal} currency={r.currency} />
                ),
              },
              {
                title: receive ? tr("已收到") : tr("已偿还"),
                render: (_, r) => (
                  <Money value={r.settled} currency={r.currency} />
                ),
              },
              {
                title: receive ? tr("剩余应收") : tr("剩余应付"),
                render: (_, r) => (
                  <Money value={r.outstanding} currency={r.currency} />
                ),
              },
              {
                title: tr("状态"),
                render: (_, r) => (
                  <Tag>
                    {!reimbursement && r.status === 'Draft'
                      ? tr("待归还")
                      : reimbursement && r.status === 'Partial'
                        ? tr("部分报销")
                        : reimbursement && r.status === 'Settled'
                          ? tr("已报销")
                          : labels[r.status]}
                  </Tag>
                ),
              },
              {
                title: tr("操作"),
                render: (_, r) => (
                  <Space><Button type="link" onClick={() => setSelectedId(r.id)}>
                    {tr("查看详情")}</Button>
                    {!reimbursement && <Button type="link" danger loading={remove.isPending && remove.variables?.id === r.id} onClick={() => confirmDelete(r)}>{tr('删除')}</Button>}
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      )}
      <Drawer
        open={!!selected}
        title={tr("资金往来详情")}
        width="min(650px, 100vw)"
        onClose={() => setSelectedId(undefined)}
      >
        {selected && (
          <>
            <Descriptions
              column={1}
              items={[
                {
                  key: 'who',
                  label: tr("对象"),
                  children: <Sensitive>{selected.counterparty}</Sensitive>,
                },
                {
                  key: 'total',
                  label: tr("原始金额"),
                  children: (
                    <Money
                      value={selected.principal}
                      currency={selected.currency}
                    />
                  ),
                },
                {
                  key: 'rest',
                  label: receive ? tr("剩余应收") : tr("剩余应付"),
                  children: (
                    <Money
                      value={selected.outstanding}
                      currency={selected.currency}
                    />
                  ),
                },
                {
                  key: 'note',
                  label: tr("备注"),
                  children: <Sensitive>{selected.note || '—'}</Sensitive>,
                },
              ]}
            />
            <Space wrap className="mb16">
              {!reimbursement && <Button danger loading={remove.isPending} onClick={() => confirmDelete(selected)}>{tr('删除借贷')}</Button>}
              <Button
                type="primary"
                disabled={minor(selected.outstanding) === 0n}
                onClick={() => open('settle')}
              >
                {reimbursement
                  ? tr("登记报销到账")
                  : receive
                    ? tr("登记收到还款")
                    : tr("登记偿还")}
              </Button>
              {reimbursement && selected.status === 'Draft' && (
                <Button
                  onClick={async () => {
                    try {
                      await businessApi.status(
                        selected.id,
                        'Submitted',
                        selected.version,
                      );
                      refresh();
                    } catch (e) {
                      message.error((e as ApiError).message);
                    }
                  }}
                >
                  {tr("标记已提交")}</Button>
              )}
              {reimbursement && minor(selected.outstanding) > 0n && (
                <Button
                  danger
                  onClick={() =>
                    modal.confirm({
                      title: tr("确认不再报销？"),
                      content:
                        tr("剩余应收将确认为资产损失，净资产减少，不计入普通消费。"),
                      onOk: async () => {
                        await businessApi.status(
                          selected.id,
                          'Abandoned',
                          selected.version,
                        );
                        refresh();
                      },
                    })
                  }
                >
                  {tr("不再报销")}</Button>
              )}
            </Space>
            <h3>{tr("完整资金记录")}</h3>
            {!reimbursement && (
              <DebtPlanningPanel
                key={selected.id}
                kind="LoanRepayment"
                accountId={selected.accountId}
                businessId={selected.id}
                currency={selected.currency}
              />
            )}
            {selected.history.map((t) => (
              <Space key={t.id} className="mb16">
                <span>
                  {formatDate(t.occurredAt)} ·{' '}
                  <Money value={t.amount} currency={t.currency} /> ·{' '}
                  {t.status === 'Deleted' ? tr("已撤销") : tr("已确认")}
                </span>
                <Button
                  danger={t.status !== 'Deleted'}
                  onClick={() =>
                    modal.confirm({
                      title:
                        t.status === 'Deleted'
                          ? tr("恢复这笔记录？")
                          : tr("撤销这笔记录？"),
                      content: tr("将同时影响资金账户与关联应收、应付余额。"),
                      onOk: async () => {
                        await businessApi.transaction(
                          selected.id,
                          t.id,
                          t.status === 'Deleted' ? 'restore' : 'delete',
                          selected.version,
                        );
                        refresh();
                      },
                    })
                  }
                >
                  {t.status === 'Deleted' ? tr("恢复") : tr("撤销")}
                </Button>
              </Space>
            ))}
            <TransactionTable
              items={selected.history}
              loading={false}
              onDetail={(t) => setTransactionId(t.id)}
            />
          </>
        )}
      </Drawer>
      <Drawer
        zIndex={1100}
        open={!!mode}
        title={
          mode === 'settle'
            ? receive
              ? tr("登记收款")
              : tr("登记还款")
            : reimbursement
              ? tr("新增垫付")
              : kind === 'Lent'
                ? tr("新增借出")
                : tr("新增借入")
        }
        width="min(460px, 100vw)"
        onClose={() => !mutation.isPending && setMode(undefined)}
        extra={
          <Button
            type="primary"
            loading={mutation.isPending}
            onClick={async () => {
              if (lock.current) return;
              try {
                const v = await form.validateFields();
                lock.current = true;
                mutation.mutate(v);
              } catch {
                /* Form 显示字段校验信息。 */
              }
            }}
          >
            {tr("保存")}</Button>
        }
      >
        <Form form={form} layout="vertical">
          {mode === 'create' && (
            <Form.Item
              name="counterparty"
              label={reimbursement ? tr("报销对象") : receive ? tr("借给谁") : tr("向谁借")}
              rules={[
                { required: true, whitespace: true, message: tr("请输入对象") },
              ]}
            >
              <Input maxLength={100} />
            </Form.Item>
          )}
          <Form.Item
            name="amount"
            label={tr("金额")}
            rules={[
              {
                validator: (_, v: string) => {
                  try {
                    return minor(v) > 0n &&
                      (mode !== 'settle' ||
                        !selected ||
                        minor(v) <= minor(selected.outstanding))
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error('金额必须大于 0 且不超过剩余额度'),
                        );
                  } catch {
                    return Promise.reject(
                      new Error('请输入有效金额，最多两位小数'),
                    );
                  }
                },
              },
            ]}
          >
            <Input inputMode="decimal" autoFocus />
          </Form.Item>
          <Form.Item
            name="accountId"
            label={receive && mode === 'settle' ? tr("收款账户") : tr("资金账户")}
            rules={[{ required: true, message: tr("请选择账户") }]}
          >
            <AccountSelector />
          </Form.Item>
          {mode==='create' && kind==='Borrowed' && <Form.Item name="contractAccountId" label={tr("消费/抵押贷款档案（可选）")}><Select allowClear placeholder={tr("不选则按原规则建立应付账户")} options={accounts.data?.filter(a=>a.status==='Active'&&['ConsumerLoan','SecuredLoan'].includes(a.type)).map(a=>({value:a.id,label:a.name}))}/></Form.Item>}
          <Form.Item
            name="occurredAt"
            label={tr("日期时间")}
            rules={[{ required: true }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label={tr("备注")}>
            <Input.TextArea maxLength={500} />
          </Form.Item>
        </Form>
      </Drawer>
      <TransactionDrawer
        id={transactionId}
        onClose={() => setTransactionId(undefined)}
      />
    </>
  );
}
