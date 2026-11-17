import { usePreferredCurrency } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { DateInput } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { t as tr, useLocale } from '../i18n';
import { Sensitive } from '../components/Sensitive';
import { LoadingState } from '../components/LoadingState';
import { PageTitle } from '../components/PageTitle';
import { useEffect, useState } from 'react';
import { useCopilotPageContext } from '../features/ai/copilotContext';
import {
  App,
  Button,
  Card,
  Form,
  Drawer,
  Checkbox,
  Input,
  InputNumber,
  Tag,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { accountApi, transactionApi } from '../api/finance';
import { Money } from '../components/Money';
import { ErrorState } from '../components/Feedback';
import { accountLabels } from '../constants/mappings';
import { TransactionTable } from '../features/transactions/TransactionTable';
import { TransactionDrawer } from '../features/transactions/TransactionDrawer';
import {
  AccountManagerList,
  AccountActions,
} from '../features/accounts/AccountManagerList';
import { AccountToolbar } from '../features/accounts/AccountToolbar';
import { AccountManagementPanels } from '../features/accounts/AccountManagementPanels';
import { accounts2Api } from '../api/accounts2';
import { useUI } from '../stores/ui';
import { CreditCardPanel } from '../features/accounts/CreditCardPanel';
import { FundStatusPanel } from '../features/accounts/FundStatusPanel';
import { decimal, minor } from '../utils/finance';
import type { Account, ApiError } from '../types';
export default function AccountsPage() {
  useLocale();
  const { id } = useParams();
  const preferredCurrency = usePreferredCurrency();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const cache = useQueryClient();
  const [form] = Form.useForm<Account>();
  const editingType = Form.useWatch('type', form);
  const editingBillingMode = Form.useWatch('billingMode', form);
  const [edit, setEdit] = useState<Account | 'new'>();
  const [transactionId, setTransactionId] = useState<string>();
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); setTransactionId(undefined); }, [id]);
  const q = useQuery({ queryKey: ['accounts'], queryFn: accountApi.list });
  useCopilotPageContext({
    accountIds: id ? [id] : undefined,
    currency: q.data?.find((a) => a.id === id)?.currency,
  });
  const groups = useQuery({
    queryKey: ['account-groups'],
    queryFn: accounts2Api.groups,
  });
  const rows = useQuery({
    queryKey: ['transactions', 'account', id, page],
    queryFn: ({ signal }) =>
      transactionApi.list({
        page,
        pageSize: 20,
        sort: 'occurredAt:desc',
        accountId: id,
      }, signal),
    enabled: !!id,
  });
  const save = useMutation({
    mutationFn: (a: Account) =>
      accountApi.save(
        {
          ...a,
          cardNumber: a.cardNumber || '',
          bankBranch: a.bankBranch || '',
          openedAt: a.openedAt || undefined,
          closedAt: a.closedAt || undefined,
          version: edit && edit !== 'new' ? edit.version : undefined,
        },
        edit && edit !== 'new' ? edit.id : undefined,
      ),
    onSuccess: async () => {
      if (
        edit &&
        edit !== 'new' &&
        form.getFieldValue('status') !== 'Active' &&
        useUI.getState().defaultAccount === edit.id
      )
        useUI.getState().setDefaultAccount('');
      await Promise.all(
        ['accounts', 'dashboard'].map((key) =>
          cache.invalidateQueries({ queryKey: [key] }),
        ),
      );
      setEdit(undefined);
      message.success(tr('账户已保存'));
    },
    onError: (e: ApiError) => message.error(e.message),
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError)
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const selected = q.data.find((a) => a.id === id);
  const open = (a: Account | 'new') => {
    setEdit(a);
    form.resetFields();
    form.setFieldsValue(
      a === 'new'
        ? {
            type: 'Bank',
            currency: preferredCurrency,
            status: 'Active',
            billingMode: 'Monthly',
          }
        : { ...a, cardNumber: a.cardNumber || a.lastFourDigits || '' },
    );
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>
            <Sensitive>{selected?.name || tr('资金各有归处')}</Sensitive>
          </PageTitle>
        </div>
        <div className="account-heading-actions">
          <Button type="primary" onClick={() => open(selected || 'new')}>
            {selected ? tr('编辑账户') : tr('＋ 新增账户')}
          </Button>
          {!id && <AccountToolbar accounts={q.data} />}
        </div>
      </div>
      {id && !selected ? (
        <ErrorState error={{ message: tr('账户不存在'), code: 'NOT_FOUND' }} />
      ) : (
        <>
          {!selected && <AccountManagerList accounts={q.data} onEdit={open} />}
          <div className="account-grid">
            {(selected ? [selected] : []).map((a) => (
              <Card
                key={a.id}
                className="account-card"
                title={
                  <Button
                    type="text"
                    onClick={() => navigate(`/accounts/${a.id}`)}
                  >
                    <Sensitive>{a.name}</Sensitive>
                  </Button>
                }
                extra={
                  <Tag>
                    {a.status === 'Active'
                      ? tr('启用')
                      : a.status === 'Disabled'
                        ? tr('停用')
                        : tr('关闭')}
                  </Tag>
                }
              >
                <span className="muted">
                  {[
                    'CreditCard',
                    'ConsumerCredit',
                    'ConsumerLoan',
                    'SecuredLoan',
                  ].includes(a.type)
                    ? minor(a.balance) > 0n
                      ? tr('当前溢缴款')
                      : tr('当前欠款')
                    : tr('账户余额')}
                </span>
                <div className="stat-value">
                  <Money
                    value={
                      [
                        'CreditCard',
                        'ConsumerCredit',
                        'ConsumerLoan',
                        'SecuredLoan',
                      ].includes(a.type)
                        ? decimal(
                            minor(a.balance) < 0n
                              ? -minor(a.balance)
                              : minor(a.balance),
                          )
                        : a.balance
                    }
                    currency={a.currency}
                  />
                </div>
                <p className="muted">
                  {accountLabels[a.type]} · {a.currency} ·{' '}
                  <Sensitive>{a.institution || tr('个人账户')}</Sensitive>
                </p>
                {['CreditCard', 'ConsumerCredit'].includes(a.type) && (
                  <>
                    <p>
                      {tr('信用额度')}{' '}
                      <Money
                        value={a.creditLimit || '0'}
                        currency={a.currency}
                      />
                    </p>
                    <p>
                      {tr('可用额度')}{' '}
                      <Money
                        value={a.availableCredit || '0'}
                        currency={a.currency}
                      />
                    </p>
                    <p>
                      {a.billingMode === 'PerPurchase'
                        ? tr('逐笔约定，以实际计划为准')
                        : tr(
                            '账单日 {0} 日 · 还款日 {1} 日',
                            a.statementDay,
                            a.paymentDay,
                          )}
                    </p>
                  </>
                )}
                <Button onClick={() => open(a)}>{tr('管理账户')}</Button>
                <AccountActions account={a} onEdit={open} />
              </Card>
            ))}
          </div>
          {selected &&
            ['CreditCard', 'ConsumerCredit'].includes(selected.type) &&
            selected.billingMode !== 'PerPurchase' && (
              <CreditCardPanel
                id={selected.id}
                title={
                  selected.type === 'ConsumerCredit'
                    ? tr('消费信用账期')
                    : tr('信用卡账单')
                }
              />
            )}
          {selected && (
            <AccountManagementPanels account={selected} onEdit={open} />
          )}
          {selected &&
            ![
              'CreditCard',
              'ConsumerCredit',
              'ConsumerLoan',
              'SecuredLoan',
              'Receivable',
              'Payable',
            ].includes(selected.type) && <FundStatusPanel id={selected.id} />}
          {selected && (
            <Card title={tr('账户交易')} className="mt20">
              {rows.isError ? <ErrorState error={rows.error} retry={() => rows.refetch()} /> : (
              <TransactionTable
                items={rows.data?.items || []}
                loading={rows.isPending}
                onDetail={(t) => setTransactionId(t.id)}
                pagination={{
                  current: page,
                  pageSize: 20,
                  total: rows.data?.total,
                  onChange: setPage,
                  showSizeChanger: false,
                }}
              />)}
            </Card>
          )}
        </>
      )}
      <Drawer
        title={edit === 'new' ? tr('新增账户') : tr('编辑账户')}
        open={!!edit}
        onClose={() => setEdit(undefined)}
        width={Math.min(560, window.innerWidth)}
        extra={
          <Button
            type="primary"
            loading={save.isPending}
            onClick={() => form.validateFields().then((a) => save.mutate(a))}
          >
            {tr('保存账户')}
          </Button>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item
            label={tr('账户名称')}
            name="name"
            rules={[{ required: true, message: tr('请输入名称') }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={tr('账户类型')}
            name="type"
            rules={[{ required: true }]}
          >
            <Select
              disabled={edit !== 'new'}
              options={Object.entries(accountLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
          </Form.Item>
          <Form.Item label={tr('币种')} name="currency">
            <Select
              disabled={edit !== 'new'}
              options={CURRENCY_CODES.map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="institution"
            label={tr(
              ['Bank', 'CreditCard'].includes(editingType)
                ? '开户银行'
                : '机构',
            )}
          >
            <Input />
          </Form.Item>
          {['Bank', 'CreditCard'].includes(editingType) && (
            <>
              <Form.Item
                preserve={false}
                name="cardNumber"
                label={tr('银行卡号')}
                rules={[
                  {
                    pattern: /^[0-9]{4,30}$/,
                    message: tr('请输入4至30位数字或留空'),
                  },
                ]}
              >
                <Input inputMode="numeric" maxLength={30} autoComplete="off" />
              </Form.Item>
              <Form.Item
                preserve={false}
                name="bankBranch"
                label={tr('银行网点')}
              >
                <Input maxLength={200} />
              </Form.Item>
              <p className="muted">
                {tr('支持保存完整卡号，也可仅保留末四位。')}
              </p>
            </>
          )}
          {['CreditCard', 'ConsumerCredit'].includes(editingType) && (
            <>
              <Form.Item
                name="creditLimit"
                label={tr('信用额度')}
                rules={[
                  { required: true, message: tr('请输入额度') },
                  {
                    validator: (_, v: string) => {
                      try {
                        if (minor(v) > 0n) return Promise.resolve();
                      } catch {
                        /* 未完成输入 */
                      }
                      return Promise.reject(new Error('信用额度必须大于 0'));
                    },
                  },
                ]}
              >
                <Input inputMode="decimal" />
              </Form.Item>
              <Form.Item
                name="statementDay"
                label={tr('账单日')}
                hidden={
                  editingType === 'ConsumerCredit' &&
                  editingBillingMode === 'PerPurchase'
                }
                rules={[
                  {
                    required:
                      editingType !== 'ConsumerCredit' ||
                      editingBillingMode !== 'PerPurchase',
                    message: tr('请选择账单日'),
                  },
                ]}
              >
                <InputNumber min={1} max={31} precision={0} />
              </Form.Item>
              <Form.Item
                name="paymentDay"
                label={tr('还款日')}
                hidden={
                  editingType === 'ConsumerCredit' &&
                  editingBillingMode === 'PerPurchase'
                }
                rules={[
                  {
                    required:
                      editingType !== 'ConsumerCredit' ||
                      editingBillingMode !== 'PerPurchase',
                    message: tr('请选择还款日'),
                  },
                ]}
              >
                <InputNumber min={1} max={31} precision={0} />
              </Form.Item>
            </>
          )}
          <Form.Item name="status" label={tr('状态')}>
            <Select
              options={[
                { value: 'Active', label: tr('启用') },
                { value: 'Paused', label: tr('暂停使用') },
                { value: 'Disabled', label: tr('停用') },
                { value: 'Archived', label: tr('归档') },
                { value: 'Closed', label: tr('关闭') },
              ]}
            />
          </Form.Item>
          {editingType === 'ConsumerCredit' && (
            <Form.Item
              name="billingMode"
              label={tr('消费信用账期模式')}
              initialValue="Monthly"
            >
              <Select
                options={[
                  { value: 'Monthly', label: tr('月账期（明确账单/还款日）') },
                  {
                    value: 'PerPurchase',
                    label: tr('逐笔约定（以实际计划为准）'),
                  },
                ]}
              />
            </Form.Item>
          )}
          {editingType === 'ElectronicWallet' && (
            <p>
              {tr(
                '微信零钱与零钱通、支付宝余额与余额宝须按实际资金产品分别建档；Apple Pay 等授权工具在付款工具中管理。',
              )}
            </p>
          )}
          {['ConsumerLoan', 'SecuredLoan'].includes(editingType) && (
            <>
              <Form.Item name="contractNumber" label={tr('贷款合同编号')}>
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item name="loanPurpose" label={tr('贷款用途')}>
                <Input maxLength={200} />
              </Form.Item>
              <p>
                {tr(
                  '本金通过已有借贷模块登记放款、还款和计划；不在此录入权威本金。抵押物在实物资产中关联，不从资产金额直接扣除。',
                )}
              </p>
            </>
          )}
          <Form.Item name="alias" label={tr('账户别名')}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="accountCode" label={tr('自定义编号')}>
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item name="groupId" label={tr('账户分组')}>
            <Select
              allowClear
              options={groups.data?.map((g) => ({
                value: g.id,
                label: g.name,
              }))}
            />
          </Form.Item>
          <Form.Item name="isPinned" valuePropName="checked">
            <Checkbox>{tr('置顶')}</Checkbox>
          </Form.Item>
          <Form.Item name="isDefaultIncome" valuePropName="checked">
            <Checkbox>{tr('默认收入账户')}</Checkbox>
          </Form.Item>
          <Form.Item name="isDefaultExpense" valuePropName="checked">
            <Checkbox>{tr('默认支出账户')}</Checkbox>
          </Form.Item>
          <Form.Item name="openedAt" label={tr('开户日期')}>
            <DateInput type="date" />
          </Form.Item>
          <Form.Item name="closedAt" label={tr('机构实际销户日期')}>
            <DateInput type="date" />
          </Form.Item>
          <Form.Item name="description" label={tr('详细备注')}>
            <Input.TextArea maxLength={2000} />
          </Form.Item>
          <p className="muted">
            {tr('有历史交易的账户不能删除；停用后将不出现在记账列表。')}
          </p>
        </Form>
        {edit && edit !== 'new' && (
          <AccountActions account={edit} onEdit={open} />
        )}
      </Drawer>
      <TransactionDrawer
        id={transactionId}
        onClose={() => setTransactionId(undefined)}
      />
    </>
  );
}
