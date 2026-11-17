import { TransactionSharingFields } from '../collaboration/TransactionSharingFields';
import { Sensitive } from '../../components/Sensitive';
import { usePreferredCurrency } from '../../hooks/useCurrency';
import { currencyOptions, currencySymbol } from '../../constants/currencies';
import { latestFx } from '../../api/currencies';
import { DatePicker } from '../../components/ResponsiveDatePicker';
import { Select } from '../../components/TouchSelect';
import { useMobile } from '../../hooks/useMobile';
import { t as tr, useLocale } from '../../i18n';
import { useEffect, useId, useRef, useState } from 'react';
import {
  App,
  Alert,
  Button,
  Collapse,
  Drawer,
  Form,
  Input,
  Space,
  Switch,
  Tabs,
} from 'antd';
import type { DrawerProps, InputRef } from 'antd';
import './transaction-create.css';
import {
  useMutation,
  useQuery,
  useQueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import {
  DirectorySelector,
  MerchantSelector,
} from '../../components/BusinessSelectors';
import { accountApi, transactionApi } from '../../api/finance';
import { planningApi } from '../../api/planning';
import { AccountSelector, CategorySelector } from '../../components/Selectors';
import { Money } from '../../components/Money';
import { RefundSourceSelector } from './RefundSourceSelector';
import { PromotionFields } from './PromotionFields';
import { ErrorState } from '../../components/Feedback';
import { convertAmount } from '../../utils/exchange';
import { transactionLabels } from '../../constants/mappings';
import { useUI } from '../../stores/ui';
import {
  decimal,
  minor,
  validateRefund,
  validateSplits,
  validateTransfer,
} from '../../utils/finance';
import type {
  ApiError,
  SaveTransactionRequest,
  Transaction,
  TransactionType,
  SplitItem,
} from '../../types';
interface EntryValues extends Omit<SaveTransactionRequest, 'occurredAt'> {
  occurredAt: dayjs.Dayjs;
}
const supported: (TransactionType | 'TopUp' | 'Withdrawal')[] = [
  'Expense',
  'Income',
  'Transfer',
  'TopUp',
  'Withdrawal',
  'Refund',
  'CreditCardPayment',
  'AssetLoss',
];
function EntrySurface({ page, ...props }: DrawerProps & { page: boolean }) {
  if (!page) return <Drawer {...props} />;
  return (
    <section className="transaction-create-surface" aria-label={tr('记账中心')}>
      <div className="transaction-create-content">{props.children}</div>
      <div className="transaction-create-actions">{props.footer}</div>
    </section>
  );
}
export function QuickEntry({
  editing,
  refundFrom,
  onDone,
  presentation = 'drawer',
}: {
  editing?: Transaction;
  refundFrom?: Transaction;
  onDone?: () => void;
  presentation?: 'drawer' | 'page';
}) {
  useLocale();
  const mobile = useMobile();
  const page = presentation === 'page';
  const formId = useId();
  const [resetCount, setResetCount] = useState(0);
  const preferredCurrency = usePreferredCurrency();
  const [currencyChoice, setCurrencyChoice] = useState<string>();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<EntryValues>();
  const entryType = useUI((s) => (page ? 'Expense' : s.entryType));
  const template = useUI((s) => (page ? undefined : s.template));
  const aiDraft = useUI((s) => (page ? undefined : s.aiDraft));
  const entryAccount = useUI((s) => (page ? undefined : s.entryAccount));
  const closeEntry = useUI((s) => s.closeEntry);
  const setDefaultAccount = useUI((s) => s.setDefaultAccount);
  const [type, setType] = useState<TransactionType>('Expense');
  const [transferKind, setTransferKind] = useState<'TopUp' | 'Withdrawal' | ''>(
    '',
  );
  const [split, setSplit] = useState(false);
  const [multiPayment, setMultiPayment] = useState(false);
  const zeroAmountAllowed =
    type === 'Expense' || type === 'Income' || type === 'Transfer';
  const [receipt, setReceipt] = useState<
    { id: string; name: string; balance: string; currency: string }[]
  >([]);
  const amountRef = useRef<InputRef>(null);
  const continuing = useRef(false);
  const lock = useRef(false);
  const submission = useRef<{ fingerprint: string; key: string } | undefined>(
    undefined,
  );
  const initializedSource = useRef<string | undefined>(undefined);
  const cache = useQueryClient();
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const planning = useQuery({
    queryKey: ['planningCapabilities'],
    queryFn: planningApi.capabilities,
    retry: false,
    staleTime: 300000,
    enabled: entryType !== null && !editing,
  });
  const suggestion = useMutation({
    mutationFn: async () => {
      await form.validateFields(['amount', 'accountId']);
      const v = form.getFieldsValue();
      return planningApi.suggest({
        ...v,
        type,
        occurredAt: v.occurredAt.toISOString(),
        note: v.note || '',
        fee: v.fee || '0',
        tagIds: v.tagIds || [],
        splits: v.splits || [],
      });
    },
    onSuccess: (r) => {
      if (!r.hitRules.length && !r.promotionSuggestions?.length) {
        void message.info(tr('暂无匹配规则，表单未改变'));
        return;
      }
      modal.confirm({
        title: tr('自动分类建议'),
        width: 520,
        content: (
          <>
            <p>
              {tr('命中')}
              {r.hitRules.length}{' '}
              {tr('条规则；只填写仍为空白的字段。填入表单后仍需保存才能记账。')}
            </p>
            <QueryClientProvider client={cache}>
              {!!r.promotionSuggestions?.length && (
                <Alert
                  type="info"
                  message={tr(
                    '可用权益建议（请在优惠信息中自行确认实际抵扣金额）',
                  )}
                  description={r.promotionSuggestions
                    .map(
                      (b) =>
                        `${b.name} · ${b.platform} · ${dayjs(b.expiresAt).format('YYYY-MM-DD')}到期`,
                    )
                    .join('；')}
                />
              )}
              <Form layout="vertical" disabled>
                <Form.Item label={tr('建议分类')}>
                  <CategorySelector
                    value={r.after.categoryId}
                    kind={type === 'Income' ? 'Income' : 'Expense'}
                  />
                </Form.Item>
                <Form.Item label={tr('建议商户')}>
                  <Input value={r.after.merchant} />
                </Form.Item>
                <Form.Item label={tr('建议备注')}>
                  <Input.TextArea value={r.after.note} />
                </Form.Item>
                <Form.Item label={tr('建议项目')}>
                  <DirectorySelector
                    kind="projects"
                    value={r.after.projectId}
                  />
                </Form.Item>
                <Form.Item label={tr('建议标签')}>
                  <DirectorySelector
                    kind="tags"
                    multiple
                    value={r.after.tagIds}
                  />
                </Form.Item>
              </Form>
            </QueryClientProvider>
            {r.conflicts.length > 0 && (
              <Alert
                type="warning"
                message={tr('规则存在冲突，已按优先级选取建议；请核对后确认。')}
              />
            )}
          </>
        ),
        okText: tr('填入待确认表单'),
        onOk: () => {
          for (const field of [
            'categoryId',
            'merchant',
            'projectId',
            'note',
          ] as const)
            if (!form.getFieldValue(field))
              form.setFieldValue(field, r.after[field]);
          form.setFieldValue('tagIds', [
            ...new Set([
              ...(form.getFieldValue('tagIds') || []),
              ...(r.after.tagIds || []),
            ]),
          ]);
        },
      });
    },
    onError: (e: Error) => message.error(e.message || tr('请先填写金额和账户')),
  });
  const watchedAmount = Form.useWatch('amount', form) || '0';
  const originalId = Form.useWatch('originalTransactionId', form);
  const source = useQuery({
    queryKey: ['transactions', 'refund-source', originalId, editing?.id],
    queryFn: () => transactionApi.refundSource(originalId!, editing?.id),
    enabled: !!originalId && type === 'Refund',
  });
  const original = source.data;
  const accountId = Form.useWatch('accountId', form);
  const toAccountId = Form.useWatch('toAccountId', form);
  const splits = Form.useWatch('splits', form) || [];
  const paymentValues = Form.useWatch('payments', form) || [];
  let paymentTotal = '0.00',
    paymentRemaining = '0.00';
  try {
    const total = paymentValues.reduce(
      (sum: bigint, p: { amount?: string }) => sum + minor(p?.amount || '0'),
      0n,
    );
    paymentTotal = decimal(total);
    paymentRemaining = decimal(minor(watchedAmount) - total);
  } catch {
    /* Validation reports malformed input. */
  }
  const account = accounts.data?.find((a) => a.id === accountId);
  const explicitAccount = accounts.data?.find((a) => a.id === entryAccount);
  const entryCurrency =
    currencyChoice ??
    editing?.currency ??
    refundFrom?.currency ??
    aiDraft?.currency ??
    explicitAccount?.currency ??
    preferredCurrency;
  const target = accounts.data?.find((a) => a.id === toAccountId);
  const crossCurrency =
    account && target && account.currency !== target.currency;
  const liveRate = useMutation({
    mutationFn: () => latestFx(account!.currency, target!.currency),
    onSuccess: (quote) => {
      const currentSource = accounts.data?.find(
        (a) => a.id === form.getFieldValue('accountId'),
      );
      const currentTarget = accounts.data?.find(
        (a) => a.id === form.getFieldValue('toAccountId'),
      );
      if (
        currentSource?.currency !== quote.baseCurrency ||
        currentTarget?.currency !== quote.targetCurrency
      )
        return;
      form.setFieldValue('exchangeRate', quote.rate);
      message.success(
        '已填入参考汇率，报价日期 ' + quote.date + '；请核对实际成交金额',
      );
    },
    onError: (error: Error) => message.error(error.message),
  });
  const rate = Form.useWatch('exchangeRate', form);
  useEffect(() => {
    if (!crossCurrency) return;
    try {
      form.setFieldValue(
        'receivedAmount',
        convertAmount(watchedAmount, rate || ''),
      );
    } catch {
      form.setFieldValue('receivedAmount', undefined);
    }
  }, [crossCurrency, watchedAmount, rate, form]);
  useEffect(() => {
    if (!original || type !== 'Refund') return;
    if (initializedSource.current === original.id) return;
    initializedSource.current = original.id;
    form.setFieldValue(
      'splits',
      original.splits.length
        ? original.refundableSplits.map((s) => ({
            categoryId: s.categoryId,
            amount:
              editing?.splits.find((x) => x.categoryId === s.categoryId)
                ?.amount || '0.00',
          }))
        : [],
    );
  }, [original, type, editing, form]);
  const open = page || entryType !== null || !!editing || !!refundFrom;
  useEffect(() => {
    if (!open) return;
    submission.current = undefined;
    initializedSource.current = undefined;
    setType(editing?.type || (refundFrom ? 'Refund' : entryType) || 'Expense');
    setTransferKind(editing?.transferKind || '');
    setSplit(!!editing?.splits.length);
    setMultiPayment((editing?.payments?.length ?? 0) > 1);
    setReceipt([]);
    setCurrencyChoice(undefined);
    form.resetFields();
    form.setFieldsValue(
      editing
        ? {
            ...editing,
            transferKind: editing.transferKind ?? undefined,
            productName: editing.productName ?? undefined,
            occurredAt: dayjs(editing.occurredAt),
          }
        : {
            accountId:
              entryType === 'Expense' && entryAccount
                ? entryAccount
                : useUI.getState().defaultAccount,
            toAccountId:
              entryType === 'CreditCardPayment' ? entryAccount : undefined,
            amount: aiDraft?.amount ?? template?.amount,
            categoryId: aiDraft?.categoryId ?? template?.categoryId,
            occurredAt: aiDraft ? dayjs(aiDraft.occurredAt) : dayjs(),
            merchant: aiDraft?.merchant,
            ...(aiDraft ? { accountId: aiDraft.accountId } : {}),
            ...(refundFrom
              ? {
                  originalTransactionId: refundFrom.id,
                  accountId: refundFrom.accountId,
                  merchant: refundFrom.merchant,
                }
              : {}),
            fee: '0.00',
            feeCategoryId: 'fee',
            note: aiDraft?.note ?? '',
            tagIds: aiDraft?.tagIds ?? [],
            splits: [],
          },
    );
  }, [
    open,
    resetCount,
    editing,
    entryType,
    entryAccount,
    template,
    aiDraft,
    refundFrom,
    form,
  ]);
  useEffect(() => {
    if (!open || editing || !accounts.data || aiDraft) return;
    const usable = accounts.data.filter(
      (a) =>
        a.status === 'Active' &&
        a.currency === entryCurrency &&
        !['Receivable', 'Payable', 'ConsumerLoan', 'SecuredLoan'].includes(
          a.type,
        ) &&
        (type !== 'AssetLoss' ||
          !['CreditCard', 'ConsumerCredit'].includes(a.type)),
    );
    if (usable.some((a) => a.id === form.getFieldValue('accountId'))) return;
    const preferred =
      usable.find((a) => a.id === useUI.getState().defaultAccount) ||
      usable.find((a) =>
        type === 'Income' ? a.isDefaultIncome : a.isDefaultExpense,
      ) ||
      usable.find((a) => ['Alipay', 'WeChat', 'Cash'].includes(a.type)) ||
      usable[0];
    form.setFieldValue('accountId', preferred?.id);
  }, [open, editing, accounts.data, type, form, aiDraft, entryCurrency]);
  const close = () => {
    if (!page) closeEntry();
    onDone?.();
  };
  const save = useMutation({
    mutationFn: (body: SaveTransactionRequest) => {
      const fingerprint = JSON.stringify(body);
      if (submission.current?.fingerprint !== fingerprint)
        submission.current = { fingerprint, key: crypto.randomUUID() };
      return transactionApi.save(body, editing?.id, submission.current.key);
    },
    onSuccess: async (_result, body) => {
      void Promise.all(
        [
          'transactions',
          'space-report',
          'transaction-sharing',
          'concert',
          'concerts',
          'concert-annual',
          'concert-transactions',
          'transactionPromotions',
          'promotions',
          'promotionReport',
          'accounts',
          'dashboard',
          'reports',
          'financial-report',
          'budgets',
          'directory',
          'recurringOccurrences',
          'planningSummary',
          'calendarEvents',
          'ai-drafts',
        ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
      if (body.type === 'Expense') {
        try {
          const fresh = await accountApi.list();
          cache.setQueryData(['accounts'], fresh);
          const saved = await transactionApi.detail(_result.data.data.id);
          const affected = (saved.accountBalances ?? []).map((a) => ({
            ...a,
            id: a.accountId,
          }));
          setReceipt(affected);
          message.success({
            key: 'expense-balance-receipt',
            duration: 8,
            content: (
              <div>
                {tr('消费已保存 · 交易后余额')}
                {affected.map((a) => (
                  <div key={a.id}>
                    <Sensitive>{a.name}</Sensitive>：
                    <Money value={a.balance} currency={a.currency} />
                  </div>
                ))}
              </div>
            ),
          });
        } catch {
          message.success(
            tr('消费已保存，交易后余额暂未加载，请在交易详情核对'),
          );
        }
      } else message.success(tr('已保存'));
      submission.current = undefined;
      setDefaultAccount(body.accountId);
      form.setFieldValue('accountId', body.accountId);
      if (continuing.current && !editing && !aiDraft) {
        form.setFieldsValue({
          amount: undefined,
          promotion: undefined,
          note: '',
          productName: undefined,
          splits: [],
          payments: [],
          originalTransactionId: undefined,
        });
        setSplit(false);
        initializedSource.current = undefined;
        setMultiPayment(false);
        amountRef.current?.focus();
      } else close();
    },
    onError: (e: ApiError) => message.error(e.message),
    onSettled: () => {
      lock.current = false;
    },
  });
  const confirmZeroAmount = () =>
    new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      modal.confirm({
        title: tr('实际金额为 0.00'),
        content: tr('确认保存这笔 0 元交易吗？'),
        okText: tr('确认保存'),
        cancelText: tr('取消'),
        onOk: () => settle(true),
        onCancel: () => settle(false),
        afterClose: () => settle(false),
      });
    });
  const submit = async (keep: boolean) => {
    if (lock.current) return;
    if (
      !editing &&
      aiDraft &&
      account &&
      account.currency !== aiDraft.currency
    ) {
      message.error(
        `草稿币种为${aiDraft.currency}，请选择相同币种账户或重新核对草稿。`,
      );
      return;
    }
    lock.current = true;
    try {
      const values = await form.validateFields();
      let zero = false;
      try {
        zero = zeroAmountAllowed && minor(values.amount) === 0n;
      } catch {
        zero = false;
      }
      if (zero && !(await confirmZeroAmount())) {
        lock.current = false;
        return;
      }
      continuing.current = keep;
      save.mutate({
        ...(aiDraft && !editing
          ? {
              origin: 'AiConfirmed' as const,
              aiDraftId: aiDraft.draftId,
              aiDraftVersion: aiDraft.version,
            }
          : {}),
        ...values,
        collaboration: {
          ...values.collaboration,
          bookId: values.collaboration?.bookId || null,
          rule: values.collaboration?.rule || 'Equal',
          shares: type === 'Expense' ? values.collaboration?.shares || [] : [],
        },
        type,
        currency: entryCurrency,
        payments:
          type === 'Expense'
            ? multiPayment
              ? (values.payments ?? []).map((p) => ({
                  ...p,
                  amount: decimal(minor(p.amount)),
                }))
              : []
            : [],
        accountId:
          type === 'Expense' && multiPayment
            ? values.payments![0].accountId
            : values.accountId,
        transferKind: type === 'Transfer' ? transferKind : undefined,
        productName:
          type === 'Expense' ? values.productName?.trim() || '' : undefined,
        toAccountId:
          type === 'Transfer' || type === 'CreditCardPayment'
            ? values.toAccountId
            : undefined,
        originalTransactionId:
          type === 'Refund' ? values.originalTransactionId : undefined,
        feeCategoryId:
          type === 'Transfer' || type === 'CreditCardPayment'
            ? values.feeCategoryId
            : undefined,
        amount: decimal(minor(values.amount)),
        promotion:
          (type === 'Expense' ||
            type === 'Transfer' ||
            type === 'CreditCardPayment') &&
          values.promotion?.originalAmount
            ? {
                ...values.promotion,
                currency: account?.currency || entryCurrency,
                shippingAmount: values.promotion.shippingAmount || '0',
                lines: (values.promotion.lines || []).map((line, order) => ({
                  ...line,
                  order,
                })),
              }
            : undefined,
        occurredAt: values.occurredAt.toISOString(),
        note: values.note || '',
        projectId: form.getFieldValue('projectId'),
        tagIds: form.getFieldValue('tagIds') || [],
        splits:
          type === 'Refund'
            ? (form.getFieldValue('splits') || []).filter(
                (s: SplitItem) => minor(s.amount || '0') > 0n,
              )
            : split
              ? form.getFieldValue('splits') || []
              : [],
        receivedAmount: crossCurrency ? values.receivedAmount : undefined,
        exchangeRate: crossCurrency ? values.exchangeRate : undefined,
        fee:
          type === 'Transfer' || type === 'CreditCardPayment'
            ? values.fee || '0.00'
            : '0.00',
        version: editing?.version,
      });
    } catch {
      lock.current = false;
    }
  };
  const transfer = type === 'Transfer' || type === 'CreditCardPayment';
  let remaining = '0.00';
  try {
    remaining = decimal(
      minor(watchedAmount) -
        splits.reduce((s, x) => s + minor(x.amount || '0'), 0n),
    );
  } catch {
    remaining = '0.00';
  }
  return (
    <EntrySurface
      page={page}
      title={editing ? tr('编辑交易') : tr('记一笔')}
      width="min(480px, 100vw)"
      open={open}
      onClose={() => !save.isPending && close()}
      destroyOnHidden
      afterOpenChange={(visible) =>
        visible && setTimeout(() => amountRef.current?.focus(), 50)
      }
      footer={
        <Space className="entry-footer" wrap>
          <Button
            size="large"
            type="primary"
            loading={save.isPending}
            onClick={() => submit(false)}
          >
            {tr('保存')}
          </Button>
          {!editing && (
            <Button
              size="large"
              disabled={save.isPending}
              onClick={() => submit(true)}
            >
              {tr('保存并继续')}
            </Button>
          )}
          {page && (
            <>
              <Button
                size="large"
                disabled={save.isPending}
                onClick={() => setResetCount((n) => n + 1)}
              >
                {tr('重置')}
              </Button>
              <Button size="large" disabled={save.isPending} onClick={close}>
                {tr('取消')}
              </Button>
            </>
          )}
        </Space>
      }
    >
      {receipt.length > 0 && (
        <Alert
          className="mb16"
          type="success"
          message={tr('上一笔消费的交易后余额')}
          description={receipt.map((a) => (
            <div key={a.id}>
              <Sensitive>{a.name}</Sensitive>：
              <Money value={a.balance} currency={a.currency} />
            </div>
          ))}
        />
      )}
      {mobile && (
        <div className="mb16">
          <label htmlFor={`${formId}-type`}>{tr('记账类型')}</label>
          <Select
            id={`${formId}-type`}
            aria-label={tr('记账类型')}
            style={{ width: '100%', marginTop: 8 }}
            value={type === 'Transfer' && transferKind ? transferKind : type}
            onChange={(v: string) => {
              setType(
                v === 'TopUp' || v === 'Withdrawal'
                  ? 'Transfer'
                  : (v as TransactionType),
              );
              setTransferKind(v === 'TopUp' || v === 'Withdrawal' ? v : '');
              setSplit(false);
              initializedSource.current = undefined;
              setMultiPayment(false);
              form.setFieldsValue({
                promotion: undefined,
                payments: [],
                fee: '0.00',
                categoryId: undefined,
                splits: [],
                toAccountId: undefined,
                originalTransactionId: undefined,
              });
            }}
            options={supported.map((t) => ({
              value: t,
              label:
                t === 'TopUp'
                  ? tr('充值')
                  : t === 'Withdrawal'
                    ? tr('提现')
                    : transactionLabels[t],
            }))}
          />
        </div>
      )}
      {!mobile && (
        <Tabs
          activeKey={type === 'Transfer' && transferKind ? transferKind : type}
          onChange={(v) => {
            setType(
              v === 'TopUp' || v === 'Withdrawal'
                ? 'Transfer'
                : (v as TransactionType),
            );
            setTransferKind(v === 'TopUp' || v === 'Withdrawal' ? v : '');
            setSplit(false);
            initializedSource.current = undefined;
            setMultiPayment(false);
            form.setFieldsValue({
              promotion: undefined,
              payments: [],
              fee: '0.00',
              categoryId: undefined,
              splits: [],
              toAccountId: undefined,
              originalTransactionId: undefined,
            });
          }}
          items={supported.map((t) => ({
            key: t,
            label:
              t === 'TopUp'
                ? tr('充值')
                : t === 'Withdrawal'
                  ? tr('提现')
                  : transactionLabels[t],
          }))}
        />
      )}
      {save.isError && <ErrorState error={save.error} />}
      {!editing &&
        !split &&
        planning.data?.automation &&
        ['Expense', 'Income', 'Transfer'].includes(type) && (
          <Button
            className="mb16"
            disabled={save.isPending}
            loading={suggestion.isPending}
            onClick={() => suggestion.mutate()}
          >
            {tr('预览自动分类建议')}
          </Button>
        )}
      {type === 'AssetLoss' && (
        <Alert
          className="mb16"
          type="warning"
          showIcon
          message={tr(
            '资产损失会减少余额与净资产，默认不计消费支出。请填写原因；消费统计由统计规则决定。',
          )}
        />
      )}
      <Form
        form={form}
        name={formId}
        layout="vertical"
        disabled={save.isPending}
        requiredMark={false}
      >
        {aiDraft?.draftId && (
          <Form.Item
            name="aiDuplicateAcknowledged"
            valuePropName="checked"
            label={tr('已核对现有记录，确认可能重复的草稿仍需入账')}
          >
            <Switch />
          </Form.Item>
        )}
        <h3 className="form-section-title">{tr('金额与资金账户')}</h3>
        <Form.Item label="记账币种">
          <Select
            aria-label="记账币种"
            showSearch
            optionFilterProp="label"
            value={entryCurrency}
            options={currencyOptions(useUI.getState().language === 'en')}
            onChange={(code) => {
              setCurrencyChoice(code);
              setMultiPayment(false);
              form.setFieldValue('payments', []);
              form.setFieldsValue({
                accountId: undefined,
                exchangeRate: undefined,
                receivedAmount: undefined,
              });
            }}
          />
        </Form.Item>
        {!accounts.isPending &&
          !accounts.data?.some(
            (a) =>
              a.currency === entryCurrency &&
              a.status === 'Active' &&
              ![
                'Receivable',
                'Payable',
                'ConsumerLoan',
                'SecuredLoan',
              ].includes(a.type),
          ) && (
            <Alert
              type="info"
              showIcon
              message={
                '暂无 ' +
                entryCurrency +
                ' 可用资金账户，请先在账户管理中新建对应币种账户。'
              }
            />
          )}
        <Form.Item
          name="amount"
          label={tr(
            transfer ? '转账本金 · {0}' : '实际金额 · {0}',
            account?.currency || entryCurrency,
          )}
          rules={[
            { required: true, message: tr('请输入金额') },
            {
              validator: (_, v: string) => {
                try {
                  const value = minor(v);
                  if (value > 0n || (zeroAmountAllowed && value === 0n))
                    return Promise.resolve();
                } catch {
                  /* 输入尚未完成 */
                }
                return Promise.reject(
                  new Error('请输入大于 0 的金额，最多两位小数'),
                );
              },
            },
          ]}
        >
          <Input
            ref={amountRef}
            className="amount-input"
            inputMode="decimal"
            placeholder="0.00"
            prefix={currencySymbol(entryCurrency)}
          />
        </Form.Item>
        {type === 'Transfer' && (
          <p>
            <Link to="/benefits?tab=drafts" onClick={closeEntry}>
              {tr('转账含第三方补贴？创建并确认补贴草稿')}
            </Link>
          </p>
        )}
        {(type === 'Expense' || transfer) && (
          <PromotionFields
            form={form}
            currency={account?.currency || entryCurrency}
            fee={transfer}
          />
        )}
        <Form.Item
          hidden={type === 'Expense' && multiPayment}
          name="accountId"
          label={
            transfer
              ? tr('转出 / 付款账户')
              : type === 'Refund'
                ? tr('退款到账账户')
                : tr('账户')
          }
          rules={[
            {
              required: !(type === 'Expense' && multiPayment),
              message: tr('请选择账户'),
            },
          ]}
        >
          <AccountSelector
            currency={entryCurrency}
            onChange={() =>
              form.setFieldsValue({
                exchangeRate: undefined,
                receivedAmount: undefined,
              })
            }
            excludeCredit={type === 'AssetLoss'}
          />
        </Form.Item>
        {type === 'Expense' && (
          <>
            <Space className="mb16">
              <Switch
                aria-label="多账户付款"
                checked={multiPayment}
                onChange={(checked) => {
                  setMultiPayment(checked);
                  if (checked)
                    form.setFieldValue('payments', [
                      {
                        accountId: form.getFieldValue('accountId'),
                        amount: form.getFieldValue('amount') ?? '',
                      },
                      { accountId: undefined, amount: '' },
                    ]);
                  else form.setFieldValue('payments', []);
                }}
              />
              <span>{tr('多账户付款')}</span>
            </Space>
            {multiPayment && (
              <>
                <p>
                  {tr('付款合计')}：
                  <Money value={paymentTotal} currency={entryCurrency} /> ·{' '}
                  {tr('待分配金额')}：
                  <Money value={paymentRemaining} currency={entryCurrency} />
                </p>
                <Form.List
                  name="payments"
                  rules={[
                    {
                      validator: async (_, items) => {
                        if (!multiPayment) return;
                        let total: bigint | undefined;
                        try {
                          total = minor(form.getFieldValue('amount') || '0');
                        } catch {
                          total = undefined;
                        }
                        if (total === 0n)
                          throw Error(
                            tr('0 元交易只能使用一个付款账户'),
                          );
                        if (!items || items.length < 2 || items.length > 10)
                          throw Error('请选择2—10个付款账户');
                        if (
                          new Set(
                            items.map(
                              (p: { accountId: string }) => p?.accountId,
                            ),
                          ).size !== items.length
                        )
                          throw Error('付款账户不能重复');
                        try {
                          if (
                            items.reduce(
                              (sum: bigint, p: { amount: string }) =>
                                sum + minor(p?.amount || '0'),
                              0n,
                            ) !== minor(form.getFieldValue('amount') || '0')
                          )
                            throw Error();
                        } catch {
                          throw Error('付款合计必须等于消费实付金额');
                        }
                      },
                    },
                  ]}
                >
                  {(fields, { add, remove }, { errors }) => (
                    <>
                      {fields.map((field, index) => (
                        <div
                          key={field.key}
                          className="payment-split-row"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0,1fr)',
                            gap: 8,
                            padding: 12,
                            marginBottom: 12,
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                          }}
                        >
                          <Form.Item
                            name={[field.name, 'accountId']}
                            label={tr('付款账户 {0}', index + 1)}
                            rules={[
                              { required: true, message: '请选择付款账户' },
                            ]}
                          >
                            <AccountSelector
                              currency={entryCurrency}
                              onChange={(value) => {
                                if (index === 0)
                                  form.setFieldValue('accountId', value);
                              }}
                            />
                          </Form.Item>
                          <Form.Item
                            name={[field.name, 'amount']}
                            label={tr('付款金额 {0}', index + 1)}
                            rules={[
                              { required: true, message: '请填写付款金额' },
                              {
                                validator: async (_, value) => {
                                  try {
                                    let total: bigint | undefined;
                                    try {
                                      total = minor(
                                        form.getFieldValue('amount') || '0',
                                      );
                                    } catch {
                                      total = undefined;
                                    }
                                    const amount = minor(value);
                                    if (
                                      amount < 0n ||
                                      (amount === 0n && total !== 0n)
                                    )
                                      throw Error();
                                  } catch {
                                    throw Error(
                                      '付款金额须大于0，最多两位小数',
                                    );
                                  }
                                },
                              },
                            ]}
                          >
                            <Input inputMode="decimal" placeholder="0.00" />
                          </Form.Item>
                          <Button
                            danger
                            disabled={fields.length <= 2}
                            onClick={() => remove(field.name)}
                          >
                            {tr('移除此付款账户')}
                          </Button>
                        </div>
                      ))}
                      <Button
                        disabled={fields.length >= 10}
                        onClick={() => add({ amount: '' })}
                      >
                        {tr('添加付款账户')}
                      </Button>
                      <Form.ErrorList errors={errors} />
                    </>
                  )}
                </Form.List>
              </>
            )}
          </>
        )}
        {transfer && (
          <Form.Item
            name="toAccountId"
            label={
              type === 'CreditCardPayment' ? tr('信用卡账户') : tr('转入账户')
            }
            dependencies={['accountId']}
            rules={[
              {
                validator: (_, v: string) => {
                  const error = validateTransfer(
                    form.getFieldValue('accountId'),
                    v,
                  );
                  return error
                    ? Promise.reject(new Error(error))
                    : Promise.resolve();
                },
              },
            ]}
          >
            <AccountSelector
              onChange={() =>
                form.setFieldsValue({
                  exchangeRate: undefined,
                  receivedAmount: undefined,
                })
              }
              exclude={accountId}
              creditOnly={type === 'CreditCardPayment'}
            />
          </Form.Item>
        )}
        {crossCurrency && (
          <Alert
            type="warning"
            showIcon
            className="mb16"
            message={tr(
              '跨币种转账 · {0} → {1}',
              account.currency,
              target.currency,
            )}
            description={tr(
              '汇率表示 1 单位转出币种兑换的转入币种数量；手续费使用转出币种。',
            )}
          />
        )}
        {crossCurrency && (
          <>
            <Form.Item
              name="exchangeRate"
              label={
                <Space>
                  {tr('汇率')}
                  <Button
                    size="small"
                    loading={liveRate.isPending}
                    onClick={() => liveRate.mutate()}
                  >
                    获取最新参考汇率
                  </Button>
                </Space>
              }
              rules={[
                { required: true, message: tr('请输入汇率') },
                {
                  validator: (_, v: string) => {
                    try {
                      convertAmount('1', v);
                      return Promise.resolve();
                    } catch (e) {
                      return Promise.reject(e);
                    }
                  },
                },
              ]}
            >
              <Input inputMode="decimal" placeholder={tr('例如 0.14')} />
            </Form.Item>
            <Form.Item
              name="receivedAmount"
              label={tr('转入金额 · {0}', target.currency)}
              rules={[{ required: true, message: tr('请输入有效金额和汇率') }]}
            >
              <Input readOnly inputMode="decimal" />
            </Form.Item>
          </>
        )}
        {transfer && (
          <Form.Item name="feeCategoryId" label={tr('手续费分类')}>
            <CategorySelector />
          </Form.Item>
        )}
        {transfer && (
          <Form.Item
            name="fee"
            label={tr('手续费')}
            rules={[
              {
                validator: (_, v: string) => {
                  try {
                    return minor(v || '0') >= 0n
                      ? Promise.resolve()
                      : Promise.reject(new Error('手续费不能为负'));
                  } catch {
                    return Promise.reject(new Error('金额格式不正确'));
                  }
                },
              },
            ]}
          >
            <Input inputMode="decimal" placeholder="0.00" />
          </Form.Item>
        )}
        {type === 'Refund' && (
          <>
            <Form.Item
              name="originalTransactionId"
              label={tr('原消费交易')}
              rules={[{ required: true, message: tr('请选择原始交易') }]}
            >
              <RefundSourceSelector selected={original} />
            </Form.Item>
            {original && (
              <Alert
                className="mb16"
                type="info"
                message={
                  <Space wrap>
                    {tr('原金额')}{' '}
                    <Money
                      value={original.amount}
                      currency={original.currency}
                    />
                    {tr('已退款')}{' '}
                    <Money
                      value={original.refundedAmount}
                      currency={original.currency}
                    />
                    {tr('剩余')}{' '}
                    <Money
                      value={decimal(
                        minor(original.amount) - minor(original.refundedAmount),
                      )}
                      currency={original.currency}
                    />
                  </Space>
                }
              />
            )}
            {source.isError && (
              <ErrorState error={source.error} retry={() => source.refetch()} />
            )}
            {original && (
              <Button
                className="mb16"
                onClick={() =>
                  form.setFieldsValue({
                    amount: original.refundableAmount,
                    splits: original.splits.length
                      ? original.refundableSplits
                      : [],
                  })
                }
              >
                {tr('全额退还剩余金额')}
              </Button>
            )}
            {original && original.splits.length > 0 && (
              <>
                <p>{tr('按原消费分类分配退款（不退款的分类填 0）')}</p>
                <Form.List name="splits">
                  {(fields) =>
                    fields.map((field) => (
                      <div className="split-row" key={field.key}>
                        <Form.Item name={[field.name, 'categoryId']}>
                          <CategorySelector disabled />
                        </Form.Item>
                        <Form.Item name={[field.name, 'amount']}>
                          <Input
                            aria-label={tr('退款分配 {0}', field.name + 1)}
                            inputMode="decimal"
                          />
                        </Form.Item>
                      </div>
                    ))
                  }
                </Form.List>
              </>
            )}
            <Form.Item
              name="refundValidation"
              dependencies={[
                'amount',
                'originalTransactionId',
                'splits',
                'accountId',
              ]}
              rules={[
                {
                  validator: () => {
                    if (!original)
                      return Promise.reject(new Error('请先选择并加载原消费'));
                    try {
                      const refunded = decimal(minor(original.refundedAmount));
                      const error = validateRefund(
                        form.getFieldValue('amount') || '0',
                        original.amount,
                        refunded,
                      );
                      if (account?.currency !== original.currency)
                        return Promise.reject(
                          new Error('退款账户币种须与原消费一致'),
                        );
                      if (original.splits.length) {
                        const items: SplitItem[] =
                          form.getFieldValue('splits') || [];
                        if (items.some((s) => minor(s.amount || '0') < 0n))
                          return Promise.reject(new Error('分类退款不能为负'));
                        const allocation = items.filter(
                          (s) => minor(s.amount || '0') > 0n,
                        );
                        const splitError = validateSplits(
                          form.getFieldValue('amount') || '0',
                          allocation,
                        );
                        if (splitError)
                          return Promise.reject(new Error(splitError));
                        if (
                          allocation.some(
                            (item) =>
                              minor(item.amount) >
                              minor(
                                original.refundableSplits.find(
                                  (s) => s.categoryId === item.categoryId,
                                )?.amount || '0',
                              ),
                          )
                        )
                          return Promise.reject(
                            new Error('分类退款超过剩余额度'),
                          );
                      }
                      return error
                        ? Promise.reject(new Error(error))
                        : Promise.resolve();
                    } catch {
                      return Promise.reject(new Error('请输入有效金额'));
                    }
                  },
                },
              ]}
            >
              <span />
            </Form.Item>
          </>
        )}
        {(type === 'Expense' || type === 'Income' || type === 'AssetLoss') &&
          !split && (
            <Form.Item
              name="categoryId"
              label={tr('分类')}
              rules={[{ required: true, message: tr('请选择二级分类') }]}
            >
              <CategorySelector
                kind={type === 'Income' ? 'Income' : 'Expense'}
              />
            </Form.Item>
          )}
        {!transfer && type !== 'Refund' && (
          <Form.Item
            name="merchant"
            label={type === 'Income' ? tr('付款方') : tr('商户 / 对象')}
          >
            <MerchantSelector
              categoryKind={type === 'Income' ? 'Income' : 'Expense'}
              onRecommend={(id) => {
                if ((type === 'Expense' || type === 'Income') && !split)
                  form.setFieldValue('categoryId', id);
              }}
            />
          </Form.Item>
        )}
        {type === 'Expense' && (
          <Form.Item
            name="productName"
            label={tr('商品名')}
            rules={[{ max: 200, message: tr('商品名最多200个字符') }]}
          >
            <Input
              maxLength={200}
              allowClear
              placeholder={tr('选填，例如：午餐、运动鞋、洗衣液')}
            />
          </Form.Item>
        )}
        <Form.Item
          name="occurredAt"
          label={tr('日期时间')}
          rules={[{ required: true, message: tr('请选择日期') }]}
        >
          <DatePicker
            showTime
            allowClear={false}
            format="YYYY-MM-DD HH:mm:ss"
            style={{ width: '100%' }}
          />
        </Form.Item>
        <Space wrap className="mb16">
          {[0, 1, 2].map((days) => (
            <Button
              key={days}
              onClick={() => {
                const current = form.getFieldValue('occurredAt') || dayjs();
                const date = dayjs().subtract(days, 'day');
                form.setFieldValue(
                  'occurredAt',
                  date
                    .hour(current.hour())
                    .minute(current.minute())
                    .second(current.second()),
                );
              }}
            >
              {tr(days === 0 ? '今天' : days === 1 ? '昨天' : '前天')}
            </Button>
          ))}
          <Button onClick={() => form.setFieldValue('occurredAt', dayjs())}>
            {tr('现在')}
          </Button>
        </Space>
        <h3 className="form-section-title">{tr('备注与补充信息')}</h3>
        <Form.Item
          name="note"
          label={tr('备注')}
          rules={
            type === 'AssetLoss'
              ? [
                  {
                    required: true,
                    whitespace: true,
                    message: tr('请填写资产损失原因'),
                  },
                ]
              : []
          }
        >
          <Input.TextArea
            rows={2}
            placeholder={tr('选填，留下一点有用的信息')}
            maxLength={500}
          />
        </Form.Item>
        {(type === 'Expense' || type === 'Income') && (
          <Collapse
            items={[
              {
                key: 'metadata',
                label: tr('更多选项 · 项目与标签'),
                children: (
                  <>
                    <Form.Item name="projectId" label={tr('项目')}>
                      <DirectorySelector kind="projects" />
                    </Form.Item>
                    <Form.Item name="tagIds" label={tr('标签')}>
                      <DirectorySelector kind="tags" multiple />
                    </Form.Item>
                  </>
                ),
              },
            ]}
          />
        )}
        {type === 'Expense' && (
          <Collapse
            items={[
              {
                key: 'more',
                label: tr('更多选项 · 拆分消费'),
                children: (
                  <>
                    <Space className="mb16">
                      {tr('拆分为多个分类')}{' '}
                      <Switch
                        aria-label={tr('拆分为多个分类')}
                        checked={split}
                        onChange={setSplit}
                      />
                    </Space>
                    {split && (
                      <>
                        <Form.List name="splits">
                          {(fields, { add, remove }) => (
                            <>
                              {fields.map((field) => (
                                <div className="split-row" key={field.key}>
                                  <Form.Item
                                    name={[field.name, 'categoryId']}
                                    rules={[
                                      {
                                        required: true,
                                        message: tr('请选择分类'),
                                      },
                                    ]}
                                  >
                                    <CategorySelector />
                                  </Form.Item>
                                  <Form.Item
                                    name={[field.name, 'amount']}
                                    rules={[
                                      {
                                        required: true,
                                        message: tr('请输入金额'),
                                      },
                                    ]}
                                  >
                                    <Input
                                      inputMode="decimal"
                                      placeholder={tr('金额')}
                                    />
                                  </Form.Item>
                                  <Button
                                    onClick={() => remove(field.name)}
                                    aria-label={tr('删除拆分')}
                                  >
                                    ×
                                  </Button>
                                </div>
                              ))}
                              <Button
                                onClick={() =>
                                  add({ amount: '', categoryId: undefined })
                                }
                              >
                                {tr('添加拆分')}
                              </Button>
                            </>
                          )}
                        </Form.List>
                        <p>
                          {tr('剩余未分配')}{' '}
                          <Money
                            value={remaining}
                            currency={account?.currency}
                          />
                        </p>
                        <Form.Item
                          name="splitValidation"
                          dependencies={['amount', 'splits']}
                          rules={[
                            {
                              validator: () => {
                                try {
                                  const error = validateSplits(
                                    form.getFieldValue('amount') || '0',
                                    form.getFieldValue('splits') || [],
                                  );
                                  return error
                                    ? Promise.reject(new Error(error))
                                    : Promise.resolve();
                                } catch {
                                  return Promise.reject(
                                    new Error('请完善拆分金额'),
                                  );
                                }
                              },
                            },
                          ]}
                        >
                          <span />
                        </Form.Item>
                      </>
                    )}
                  </>
                ),
              },
            ]}
          />
        )}
        <TransactionSharingFields
          form={form}
          transactionId={editing?.id}
          expense={type === 'Expense'}
        />
      </Form>
    </EntrySurface>
  );
}
