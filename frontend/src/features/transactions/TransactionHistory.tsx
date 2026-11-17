import { localizedLabels } from '../../i18n';
import { t as tr, useLocale } from '../../i18n';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Empty, List, Pagination, Space, Tag } from 'antd';
import { apiClient } from '../../api/client';
import type { ApiResponse, Currency, PagedResult } from '../../types';
import { Money } from '../../components/Money';
import { ErrorState } from '../../components/Feedback';
import { formatDate } from '../../utils/finance';
import { useUI } from '../../stores/ui';

interface AuditItem {
  id: string;
  action: string;
  resourceType: string;
  createdAt: string;
  traceId: string;
  changes: { field: string; before: string | null; after: string | null }[];
}
const actions: Record<string, string> = localizedLabels({
  Create: '创建',
  Update: '修改',
  Remove: '移除',
  Revoke: '撤销',
  Restore: '恢复',
});
const fields: Record<string, string> = localizedLabels({
  Amount: '金额',
  Fee: '手续费',
  ReceivedAmount: '到账金额',
  CategoryId: '分类',
  AccountId: '账户',
  ToAccountId: '转入账户',
  OccurredAt: '记账时间',
  Merchant: '商户',
  Note: '备注',
  ProjectId: '项目',
  Status: '状态',
  Version: '版本',
});
const moneyFields = ['Amount', 'Fee', 'ReceivedAmount'];
export function TransactionHistory({
  id,
  currency,
}: {
  id: string;
  currency: Currency;
}) {
  useLocale();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const hidden = useUI((s) => s.hidden);
  const q = useQuery({
    queryKey: ['transaction-history', id, page],
    enabled: open,
    queryFn: () =>
      apiClient
        .get<ApiResponse<PagedResult<AuditItem>>>(
          `/transactions/${id}/history`,
          { params: { page, pageSize: 10 } },
        )
        .then((r) => r.data.data),
  });
  const value = (
    field: string,
    text: string | null,
    item: AuditItem,
    side: 'before' | 'after',
  ) => {
    if (text === null) return '—';
    if (moneyFields.includes(field)) {
      const code = item.changes.find(
        (change) => change.field === 'CurrencyContext',
      )?.[side];
      return (
        <Money
          value={text}
          currency={
            code === 'CNY' || code === 'USD' || code === 'HKD' ? code : currency
          }
        />
      );
    }
    if (field === 'OccurredAt') return formatDate(text, true, true);
    if (field.endsWith('Id')) return '关联已变更';
    return text;
  };
  return (
    <Card
      className="mt20"
      title={tr("操作历史")}
      extra={
        <Button type="link" onClick={() => setOpen(!open)}>
          {open ? tr("收起") : tr("查看历史")}
        </Button>
      }
    >
      {open &&
        (q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : (
          <>
            <List
              loading={q.isPending}
              locale={{
                emptyText: (
                  <Empty description={tr("暂无操作历史；启用审计前的修改不会补造记录")} />
                ),
              }}
              dataSource={q.data?.items || []}
              renderItem={(item) => (
                <List.Item>
                  <Space direction="vertical">
                    <span>
                      {formatDate(item.createdAt, true, true)}{' '}
                      <Tag>{actions[item.action] || tr("变更")}</Tag>
                      {item.resourceType === 'FinanceTransaction'
                        ? tr("交易")
                        : tr("分类或关联明细")}
                    </span>
                    {hidden ? (
                      <span>{tr("历史内容已隐藏")}</span>
                    ) : (
                      item.changes
                        .filter((change) => fields[change.field])
                        .map((change) => (
                          <span key={change.field}>
                            {fields[change.field]}：
                            {value(change.field, change.before, item, 'before')}{' '}
                            → {value(change.field, change.after, item, 'after')}
                          </span>
                        ))
                    )}
                  </Space>
                </List.Item>
              )}
            />
            <Pagination
              size="small"
              current={page}
              total={q.data?.total || 0}
              pageSize={10}
              showSizeChanger={false}
              onChange={setPage}
            />
          </>
        ))}
    </Card>
  );
}
