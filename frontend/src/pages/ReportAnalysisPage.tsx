import { lazy, Suspense } from 'react';
import { Card, Skeleton, Space } from 'antd';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { DatePicker } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { PageTitle } from '../components/PageTitle';
import { currencyOptions } from '../constants/currencies';
import { usePreferredCurrency } from '../hooks/useCurrency';
import { CURRENCY_CODES } from '../constants/currencies';
import { useCopilotPageContext } from '../features/ai/copilotContext';
import {
  reportAnalysisSections,
  type ReportAnalysisSection,
} from '../features/reports/sections';
import { t, useLocale } from '../i18n';
const Comparison = lazy(() =>
  import('../features/reports/FinancialReview').then((m) => ({
    default: m.FinancialReview,
  })),
);
const Periods = lazy(() =>
  import('../features/reports/PeriodReview').then((m) => ({
    default: m.PeriodReview,
  })),
);
const Structure = lazy(() =>
  import('../features/reports/ExpenseStructure').then((m) => ({
    default: m.ExpenseStructure,
  })),
);
const NetWorth = lazy(() =>
  import('../features/reports/NetWorthAnalysis').then((m) => ({
    default: m.NetWorthAnalysis,
  })),
);
const Metrics = lazy(() =>
  import('../features/reports/MetricCenter').then((m) => ({
    default: m.MetricCenter,
  })),
);
const Debt = lazy(() =>
  import('../features/reports/DebtPressure').then((m) => ({
    default: m.DebtPressure,
  })),
);
const Health = lazy(() =>
  import('../features/reports/FinancialHealth').then((m) => ({
    default: m.FinancialHealth,
  })),
);
export default function ReportAnalysisPage({
  section,
}: {
  section: ReportAnalysisSection;
}) {
  const locale = useLocale();
  const preferred = usePreferredCurrency();
  const [params, setParams] = useSearchParams();
  const title = reportAnalysisSections.find((s) => s.id === section)!.title;
  const validDate = (value: string | null) =>
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    dayjs(value).isValid() &&
    dayjs(value).format('YYYY-MM-DD') === value;
  const start = validDate(params.get('start'))
    ? params.get('start')!
    : dayjs().subtract(5, 'month').startOf('month').format('YYYY-MM-DD');
  const candidate = validDate(params.get('end'))
    ? params.get('end')!
    : dayjs().endOf('month').format('YYYY-MM-DD');
  const end = candidate >= start ? candidate : start;
  const currency = CURRENCY_CODES.includes(params.get('currency') || '')
    ? params.get('currency')!
    : preferred;
  const scope = { start, end, currency };
  useCopilotPageContext(scope);
  const update = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => next.set(key, value));
    setParams(next, { replace: true });
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <PageTitle>{t(title)}</PageTitle>
        </div>
      </div>
      <Card className="mb16">
        <Space wrap>
          {section !== 'periods' && section !== 'debt-pressure' && (
            <DatePicker.RangePicker
              aria-label={t('分析日期范围')}
              allowClear={false}
              value={[dayjs(start), dayjs(end)]}
              onChange={(range) => {
                if (range?.[0] && range[1])
                  update({
                    start: range[0].format('YYYY-MM-DD'),
                    end: range[1].format('YYYY-MM-DD'),
                  });
              }}
            />
          )}
          <Select
            aria-label={t('统计币种')}
            showSearch
            optionFilterProp="label"
            value={currency}
            options={currencyOptions(locale === 'en')}
            style={{ minWidth: 200 }}
            onChange={(value) => update({ currency: value })}
          />
        </Space>
      </Card>
      <Suspense fallback={<Skeleton active />}>
        {section === 'comparison' ? (
          <Comparison {...scope} />
        ) : section === 'periods' ? (
          <Periods currency={currency} />
        ) : section === 'structure' ? (
          <Structure {...scope} />
        ) : section === 'net-worth' ? (
          <NetWorth {...scope} />
        ) : section === 'metrics' ? (
          <Metrics {...scope} />
        ) : section === 'debt-pressure' ? (
          <Debt key={currency} currency={currency} />
        ) : (
          <Health {...scope} />
        )}
      </Suspense>
    </>
  );
}
