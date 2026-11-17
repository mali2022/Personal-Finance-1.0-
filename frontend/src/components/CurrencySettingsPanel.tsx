import { useState } from 'react';
import { Alert, App, Button, Card, Descriptions, Input, Space } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Select } from './TouchSelect';
import { currencyOptions } from '../constants/currencies';
import { profileApi } from '../api/profile';
import { latestFx } from '../api/currencies';
import { investmentApi } from '../api/investments';
import { usePreferredCurrency } from '../hooks/useCurrency';
import { convertAmount } from '../utils/exchange';
import { useLocale } from '../i18n';
export function CurrencySettingsPanel({
  enabledCodes,
}: {
  enabledCodes?: string[];
}) {
  const locale = useLocale();
  const preferred = usePreferredCurrency();
  const cache = useQueryClient();
  const { message } = App.useApp();
  const profile = useQuery({ queryKey: ['profile'], queryFn: profileApi.get });
  const [choice, setChoice] = useState<string>();
  const [base, setBase] = useState<string>();
  const [target, setTarget] = useState('USD');
  const [amount, setAmount] = useState('1');
  const source = base || preferred;
  const options = currencyOptions(locale === 'en');
  const save = useMutation({
    mutationFn: () =>
      profileApi.save({
        ...profile.data!,
        preferredCurrency: choice || preferred,
      }),
    onSuccess: (r) => {
      cache.setQueryData(['profile'], r);
      void cache.invalidateQueries({ queryKey: ['dashboard'] });
      void cache.invalidateQueries({ queryKey: ['session'] });
      message.success('默认货币已更新');
    },
    onError: (error: Error) => {
      message.error(error.message);
      void profile.refetch();
    },
  });
  const quote = useQuery({
    queryKey: ['live-fx', source, target],
    queryFn: () => latestFx(source, target),
    staleTime: 60000,
    refetchInterval: 300000,
    retry: false,
  });
  const store = useMutation({
    mutationFn: () =>
      investmentApi.save('/fx-valuation-rates', {
        baseCurrency: source,
        targetCurrency: target,
        rate: quote.data!.rate,
        date: quote.data!.date,
        source: quote.data!.source,
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ['fx-rates'] });
      void cache.invalidateQueries({ queryKey: ['asset-allocation'] });
      message.success('已保存为历史估值汇率');
    },
    onError: (error: Error) => message.error(error.message),
  });
  let converted = '—';
  try {
    if (quote.data) converted = convertAmount(amount, quote.data.rate);
  } catch {
    /* Invalid input is left for correction. */
  }
  return (
    <Space
      direction="vertical"
      size="large"
      style={{ width: '100%', marginBottom: 24 }}
    >
      <Card title="默认货币">
        <Space wrap>
          <Select
            aria-label="默认货币"
            showSearch
            optionFilterProp="label"
            value={choice || preferred}
            onChange={setChoice}
            options={options.filter((o) => enabledCodes?.includes(o.value))}
            style={{ minWidth: 220 }}
          />
          <Button
            type="primary"
            loading={save.isPending}
            disabled={
              !profile.data ||
              !enabledCodes ||
              (choice || preferred) === preferred
            }
            onClick={() => save.mutate()}
          >
            保存默认货币
          </Button>
        </Space>
      </Card>
      <Card title="联网最新参考汇率">
        <Space wrap>
          <Select
            aria-label="汇率基础币种"
            showSearch
            optionFilterProp="label"
            value={source}
            onChange={setBase}
            options={options}
            style={{ minWidth: 200 }}
          />
          <Button
            onClick={() => {
              setBase(target);
              setTarget(source);
            }}
          >
            交换币种
          </Button>
          <Select
            aria-label="汇率目标币种"
            showSearch
            optionFilterProp="label"
            value={target}
            onChange={setTarget}
            options={options}
            style={{ minWidth: 200 }}
          />
          <Input
            aria-label="汇率换算金额"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            style={{ width: 140 }}
          />
          <Button
            loading={quote.isFetching}
            onClick={() => void quote.refetch()}
          >
            刷新汇率
          </Button>
        </Space>
        {quote.isError && (
          <Alert
            className="mt20"
            type="warning"
            showIcon
            message={(quote.error as Error).message}
          />
        )}
        {quote.data && (
          <>
            <Descriptions
              className="mt20"
              column={{ xs: 1, sm: 2 }}
              items={[
                {
                  key: 'rate',
                  label: '报价',
                  children:
                    '1 ' + source + ' = ' + quote.data.rate + ' ' + target,
                },
                {
                  key: 'result',
                  label: '换算结果',
                  children: converted + ' ' + target,
                },
                { key: 'date', label: '报价日期', children: quote.data.date },
                {
                  key: 'fetch',
                  label: '获取时间',
                  children: new Date(quote.data.fetchedAt).toLocaleString(),
                },
              ]}
            />
            <Button
              disabled={source === target || quote.isError}
              loading={store.isPending}
              onClick={() => store.mutate()}
            >
              保存此报价为历史估值汇率
            </Button>
          </>
        )}
      </Card>
    </Space>
  );
}
