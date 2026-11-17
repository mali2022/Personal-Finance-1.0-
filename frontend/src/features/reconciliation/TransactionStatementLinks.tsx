import { useState } from 'react';
import { Alert, Button, Space, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { Money } from '../../components/Money';
import { Sensitive } from '../../components/Sensitive';
import { ErrorState } from '../../components/Feedback';
import { smartApi } from './api';
export function TransactionStatementLinks({
  transactionId,
  version,
  onNavigate,
}: {
  transactionId: string;
  version: string;
  onNavigate: () => void;
}) {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: [
      'smart-reconciliation',
      'transaction-links',
      transactionId,
      version,
      page,
    ],
    queryFn: () => smartApi.transactionLinks(transactionId, page),
    refetchInterval: false,
  });
  return (
    <div>
      <Typography.Title level={5}>
        {t('智能对账关联', 'Smart reconciliation links')}
      </Typography.Title>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        <>
          {q.data?.items.length === 0 && (
            <p>{t('暂无智能对账关联', 'No smart reconciliation links')}</p>
          )}
          {q.data?.items.map((r) => (
            <div key={r.id} className="mb16">
              <Tag color={r.conflict ? 'red' : undefined}>
                {r.state === 'Revoked'
                  ? t('已撤销', 'Revoked')
                  : r.conflict
                    ? t('存在冲突', 'Conflict')
                    : t('已确认分配', 'Confirmed allocation')}
              </Tag>
              <Tag>
                {r.confirmationMode === 'RuleAutomatic'
                  ? t('规则自动确认', 'Automatic rule confirmation')
                  : t('人工确认', 'Manual confirmation')}
              </Tag>
              <p>
                <Sensitive>{r.reference || '—'}</Sensitive> ·{' '}
                <Money value={r.allocatedAmount} currency={r.currency} />
              </p>
              <p>
                {r.createdAt} · {r.engineVersion}
              </p>
              {r.conflict && (
                <Alert
                  type="warning"
                  message={t(
                    '原交易已变化，请在工作台复核或撤销',
                    'The ledger transaction changed; review or revoke in the workspace',
                  )}
                />
              )}
              <Link
                to={`/reconciliation?accountId=${r.accountId}&statementId=${r.statementId}`}
                onClick={onNavigate}
              >
                {t(
                  '在智能工作台复核来源与分配',
                  'Review source and allocations in the smart workspace',
                )}
              </Link>
            </div>
          ))}
          <Space>
            <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              {t('上一页', 'Previous')}
            </Button>
            <span>{page}</span>
            <Button
              disabled={!q.data || page * 20 >= q.data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('下一页', 'Next')}
            </Button>
          </Space>
        </>
      )}
    </div>
  );
}
