import { localizedPair } from '../../i18n';
import { t as tr, useLocale } from '../../i18n';
import { Link } from 'react-router-dom';
import { Card, Descriptions } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import type { ApiResponse, Currency } from '../../types';
type FundStatus = { currency: Currency; bookBalance: string; availableBalance: string; activeHolds: string; pendingDebit: string; pendingCredit: string; rule: string };
export function FundStatusPanel({ id }: { id: string }) {
  useLocale();
  const q = useQuery({ queryKey: ['fund-status', id], queryFn: () => apiClient.get<ApiResponse<FundStatus>>(`/accounts/${id}/fund-status`).then(r => r.data.data) });
  return <Card title={tr("资金状态")} className="mt20" extra={<Link to={`/accounts/fund-status?accountId=${id}`}>{tr("管理及历史")}</Link>} loading={q.isPending}>
    {q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data && <><Descriptions column={{ xs: 1, sm: 2, md: 3 }} items={([
      localizedPair('bookBalance','账面余额'), localizedPair('availableBalance','可用余额'), localizedPair('activeHolds','有效冻结'), localizedPair('pendingDebit','在途扣款'), localizedPair('pendingCredit','在途到账'),
    ] as const).map(([key, label]) => ({ key, label, children: <Money value={q.data![key]} currency={q.data!.currency} /> }))} /><p className="muted">{q.data.rule}</p></>}
  </Card>;
}
