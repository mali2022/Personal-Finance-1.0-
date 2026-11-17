import { useState } from 'react';
import { Alert, Button, Card, Input, InputNumber, Select, Space, Statistic } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import type { ApiResponse } from '../../types';
import { ErrorState } from '../../components/Feedback';
import { useLocale } from '../../i18n';
import { useUI } from '../../stores/ui';
import { returnStatus } from './AssetReturnPanel';

interface Result { periodReturn: { status: string; rate: number | null }; annualizedRate: number | null; annualizationStatus: string }
export function PeriodicReturnPanel() {
  const en = useLocale() === 'en';
  const text = (zh: string, english: string) => en ? english : zh;
  const hidden = useUI(s => s.hidden);
  const [amounts, setAmounts] = useState('');
  const [period, setPeriod] = useState(12);
  const [custom, setCustom] = useState<number | null>(null);
  const calculation = useMutation({ mutationFn: (body: { amounts: string[]; periodsPerYear: number }) => apiClient.post<ApiResponse<Result>>('/investments/returns/periodic', body).then(r => r.data.data) });
  const reset = () => calculation.reset();
  const rate = (value: number) => hidden ? '••••' : `${(value * 100).toFixed(2)}%`;
  return <Card title={text('等间隔 IRR 计算', 'Periodic IRR calculation')}>
    <Space direction="vertical" style={{ width: '100%' }}>
      <Select aria-label={text('IRR 周期', 'IRR period')} value={period} onChange={value => { setPeriod(value); reset(); }} options={[{ value: 12, label: text('月度', 'Monthly') }, { value: 4, label: text('季度', 'Quarterly') }, { value: 1, label: text('年度', 'Yearly') }, { value: 0, label: text('自定义', 'Custom') }]} />
      {period === 0 && <InputNumber aria-label={text('每年周期数', 'Periods per year')} min={0.001} max={366} value={custom} onChange={value => { setCustom(value); reset(); }} />}
      <Input.TextArea aria-label={text('等间隔现金流', 'Periodic cash flows')} rows={5} value={amounts} onChange={event => { setAmounts(event.target.value); reset(); }} style={hidden ? { WebkitTextSecurity: 'disc' } as React.CSSProperties : undefined} />
      <Button loading={calculation.isPending} disabled={!amounts.trim() || (period === 0 && !custom)} onClick={() => calculation.mutate({ amounts: amounts.trim().split(/\r?\n/).map(x => x.trim()), periodsPerYear: period || custom! })}>{text('计算 IRR', 'Calculate IRR')}</Button>
      {calculation.isError && <ErrorState error={calculation.error} />}
      {calculation.data && (calculation.data.periodReturn.status === 'Success' && calculation.data.periodReturn.rate !== null ? <>
        <Statistic title={text('单期 IRR', 'IRR per period')} value={rate(calculation.data.periodReturn.rate)} />
        {calculation.data.annualizedRate !== null ? <Statistic title={text('复利年化 IRR', 'Compound annualized IRR')} value={rate(calculation.data.annualizedRate)} /> : <Alert type="warning" message={text('年化结果超出数值范围', 'Annualized result exceeds numeric range')} />}
      </> : <Alert type="warning" message={returnStatus(calculation.data.periodReturn.status, en)} />)}
    </Space>
  </Card>;
}
