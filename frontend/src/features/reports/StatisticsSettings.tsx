import { useState } from 'react';
import { t as tr, useLocale } from '../../i18n';
import {
  App,
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Form,
  Select,
  Space,
  Spin,
  Switch,
  Table,
} from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { advancedApi } from '../../api/operations';
import { ErrorState } from '../../components/Feedback';
import { Money } from '../../components/Money';
import { CURRENCY_CODES } from '../../constants/currencies';
import { usePreferredCurrency } from '../../hooks/useCurrency';
import type { ApiError, Currency, StatisticsRules } from '../../types';

const fields = [
  'includeFees',
  'includeAssetLoss',
  'includeDecreasingAdjustments',
] as const;
const labels = ['手续费计入支出', '资产损失计入支出', '减少余额的调整计入支出'];
const policyRows = [
  [
    '收入与消费',
    '收入分录取反计收入；费用分录计支出。优惠按实际入账金额统计，拆分付款不重复计消费。',
  ],
  [
    '退款',
    '按退款到账日期冲减费用与原分类；跨期退款不回写原月份，允许负净支出。',
  ],
  ['转账与信用卡还款', '本金不计收支；相关费用按手续费开关处理。'],
  [
    '借贷与报销',
    '借贷本金、垫付及收回不作为普通收支；实际费用按账本分录统计。',
  ],
  [
    '余额与资产',
    '期初余额、余额调增不作为普通收入；账户余额和净资产不受统计开关影响。',
  ],
  [
    '时间与币种',
    '使用 Asia/Shanghai 的交易发生日期；不同币种分别统计，不自动换汇。',
  ],
  [
    '统计范围',
    '使用未删除的已入账交易；计划、提醒、待确认导入不产生统计分录。',
  ],
  [
    '适用边界',
    '全账本收支、预算及复盘沿用统计规则；账户资金流动、薪酬归属月及专项业务指标保留各自定义。',
  ],
];

export function StatisticsSettings() {
  useLocale();
  const { message } = App.useApp();
  const cache = useQueryClient();
  const q = useQuery({
    queryKey: ['statisticsRules'],
    queryFn: advancedApi.rules,
  });
  const history = useQuery({
    queryKey: ['statisticsPolicyHistory'],
    queryFn: advancedApi.rulesHistory,
  });
  return (
    <Card className="mt20" title={tr('财务统计口径管理')}>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !q.data ? (
        <Spin />
      ) : (
        <PolicyEditor
          key={q.data.version}
          rules={q.data}
          saved={async () => {
            await cache.invalidateQueries();
            message.success(tr('统计规则已保存'));
          }}
        />
      )}
      <Table
        className="mt20"
        size="small"
        pagination={false}
        rowKey="name"
        dataSource={policyRows.map(([name, detail]) => ({
          name: tr(name),
          detail: tr(detail),
        }))}
        columns={[
          { title: tr('业务事项'), dataIndex: 'name', width: 160 },
          { title: tr('统计口径'), dataIndex: 'detail' },
        ]}
      />
      <Card className="mt20" size="small" title={tr('最近50次口径变更')}>
        {history.isError ? (
          <ErrorState error={history.error} retry={() => history.refetch()} />
        ) : (
          <Table
            size="small"
            loading={history.isLoading}
            rowKey="id"
            dataSource={history.data ?? []}
            pagination={{ pageSize: 5 }}
            columns={[
              {
                title: tr('时间'),
                dataIndex: 'createdAt',
                render: (v: string) =>
                  new Intl.DateTimeFormat(undefined, {
                    timeZone: 'Asia/Shanghai',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(v)),
              },
              {
                title: tr('变更内容'),
                dataIndex: 'changes',
                render: (
                  changes: { field: string; before: unknown; after: unknown }[],
                ) =>
                  changes
                    .filter((c) =>
                      [
                        'IncludeFees',
                        'IncludeAssetLoss',
                        'IncludeDecreasingAdjustments',
                      ].includes(c.field),
                    )
                    .map((c) => (
                      <div key={c.field}>
                        {tr(
                          labels[
                            [
                              'IncludeFees',
                              'IncludeAssetLoss',
                              'IncludeDecreasingAdjustments',
                            ].indexOf(c.field)
                          ],
                        )}
                        :{' '}
                        {c.before === null
                          ? '—'
                          : tr(
                              String(c.before).toLowerCase() === 'true'
                                ? '开启'
                                : '关闭',
                            )}{' '}
                        →{' '}
                        {tr(
                          String(c.after).toLowerCase() === 'true'
                            ? '开启'
                            : '关闭',
                        )}
                      </div>
                    )),
              },
            ]}
          />
        )}
      </Card>
    </Card>
  );
}

function PolicyEditor({
  rules,
  saved,
}: {
  rules: StatisticsRules;
  saved: () => Promise<void>;
}) {
  const { message } = App.useApp();
  const [form] = Form.useForm<StatisticsRules>();
  const values = Form.useWatch([], form) as StatisticsRules | undefined;
  const draft = values ?? rules;
  const [month, setMonth] = useState(dayjs());
  const preferred = usePreferredCurrency();
  const [currency, setCurrency] = useState<Currency>(preferred);
  const changed = fields.some((k) => draft[k] !== rules[k]);
  const preview = useQuery({
    queryKey: [
      'statisticsPolicyPreview',
      month.format('YYYY-MM'),
      currency,
      draft.includeFees,
      draft.includeAssetLoss,
      draft.includeDecreasingAdjustments,
      rules.version,
    ],
    queryFn: () =>
      advancedApi.previewRules(month.format('YYYY-MM'), currency, draft),
  });
  const mutation = useMutation({
    mutationFn: (body: StatisticsRules) =>
      advancedApi.saveRules({ ...body, version: rules.version }),
    onSuccess: saved,
    onError: (e: ApiError) => {
      void message.error(e.message);
    },
  });
  const preset = (fees: boolean, loss: boolean, adjustment: boolean) =>
    form.setFieldsValue({
      includeFees: fees,
      includeAssetLoss: loss,
      includeDecreasingAdjustments: adjustment,
    });
  return (
    <>
      <p>
        {tr('当前版本')} {rules.version} ·{' '}
        {tr(changed ? '有未保存的修改' : '与已保存口径一致')}
      </p>
      <Form
        form={form}
        initialValues={rules}
        layout="vertical"
        onFinish={(v) => mutation.mutate(v)}
        disabled={mutation.isPending}
      >
        <Space wrap className="mb16">
          <Button onClick={() => preset(true, false, false)}>
            {tr('日常收支（默认）')}
          </Button>
          <Button onClick={() => preset(false, false, false)}>
            {tr('不含手续费')}
          </Button>
          <Button onClick={() => preset(true, true, true)}>
            {tr('含损失与调减')}
          </Button>
          <Button onClick={() => form.setFieldsValue(rules)}>
            {tr('撤销未保存修改')}
          </Button>
        </Space>
        {fields.map((name, i) => (
          <Form.Item
            key={name}
            name={name}
            label={tr(labels[i])}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        ))}
        <Card size="small" title={tr('变更影响预览')} className="mb16">
          <Space wrap className="mb16">
            <DatePicker
              picker="month"
              allowClear={false}
              value={month}
              onChange={(v) => v && setMonth(v)}
              aria-label={tr('统计月份')}
            />
            <Select
              value={currency}
              onChange={setCurrency}
              options={CURRENCY_CODES.map((value) => ({ value, label: value }))}
              aria-label={tr('统计币种')}
            />
          </Space>
          {preview.isError ? (
            <ErrorState error={preview.error} retry={() => preview.refetch()} />
          ) : preview.isFetching ? (
            <Spin />
          ) : (
            preview.data && (
              <>
                <p>
                  {tr('范围内交易数')}：{preview.data.transactionCount}
                </p>
                <Descriptions
                  size="small"
                  column={{ xs: 1, sm: 2 }}
                  items={[
                    ['income', '统计收入'],
                    ['baseExpense', '不含手续费的净费用'],
                    ['fees', '手续费净额'],
                    ['assetLoss', '资产损失'],
                    ['decreasingAdjustments', '余额调减'],
                    ['currentExpense', '保存前支出'],
                    ['proposedExpense', '方案支出'],
                    ['expenseDifference', '支出变化'],
                    ['currentSurplus', '保存前结余'],
                    ['proposedSurplus', '方案结余'],
                  ].map(([key, label]) => ({
                    key,
                    label: tr(label),
                    children: (
                      <Money
                        value={String(preview.data![key])}
                        currency={currency}
                      />
                    ),
                  }))}
                />
              </>
            )
          )}
        </Card>
        <Button
          type="primary"
          htmlType="submit"
          loading={mutation.isPending}
          disabled={!changed}
        >
          {tr('保存统计规则')}
        </Button>
        {mutation.isError && (
          <Alert
            className="mt20"
            type="error"
            message={tr(
              '保存失败，修改尚未生效。如版本冲突，请刷新页面核对最新口径后重试。',
            )}
          />
        )}
      </Form>
    </>
  );
}
