import { WorkspaceFilters } from '../features/transactions/WorkspaceFilters';
import { WorkspaceSummary } from '../features/transactions/WorkspaceSummary';
import { WorkspaceTable } from '../features/transactions/WorkspaceTable';
import { TransactionAiPanel } from '../features/transactions/TransactionAiPanel';
import '../features/transactions/workspace.css';
import { t as tr, useLocale } from '../i18n';
import { PageTitle } from '../components/PageTitle';
import { Alert, App, Button, Card, Modal, Space } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deletionApi } from '../api/deletion';
import type { ApiError } from '../types';
import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { authApi } from '../api/client';
import { BatchDrawer } from '../features/transactions/BatchDrawer';
import { ReviewDrawer } from '../features/transactions/ReviewDrawer';
import type { Transaction } from '../types';
import { transactionApi } from '../api/finance';
import { ErrorState } from '../components/Feedback';
import { TransactionDrawer } from '../features/transactions/TransactionDrawer';
import { readTransactionFilters } from '../utils/finance';
import { useUI } from '../stores/ui';
import { SavedViewPicker } from '../features/transactions/SavedViewPicker';
import { visibleColumns } from '../features/transactions/savedViews';
import { useCopilotPageContext } from '../features/ai/copilotContext';
export default function TransactionsPage({
  review = false,
}: {
  review?: boolean;
}) {
  useLocale();
  const [params, setParams] = useSearchParams();
  const effectiveParams = new URLSearchParams(params);
  if (review) effectiveParams.set('status', 'NeedsReview');
  const { filters, issues } = readTransactionFilters(effectiveParams);
  const { message } = App.useApp();
  const cache = useQueryClient();
  const [deleting, setDeleting] = useState<{
    user?: string;
    rows: Transaction[];
    key: string;
  }>();
  const [id, setId] = useState<string>();
  const [reviewId, setReviewId] = useState<string>();
  const [batchOpen, setBatchOpen] = useState(false);

  useCopilotPageContext({
    accountIds:
      filters.accountIds?.split(',') ||
      (filters.accountId ? [filters.accountId] : undefined),
    start: filters.start,
    end: filters.end,
    currency: filters.currency,
    categoryId: filters.categoryId,
    projectId: filters.projectId,
    tagId: filters.tagId,
    type: filters.type,
    status: filters.status,
    transactionId: id,
  });
  const session = useQuery({
    queryKey: ['session'],
    queryFn: authApi.me,
    staleTime: Infinity,
  });
  const [selection, setSelection] = useState<{
    user?: string;
    rows: Record<string, Transaction>;
  }>({ rows: {} });
  const selected = selection.user === session.data?.id ? selection.rows : {};
  const remove = useMutation({
    mutationFn: () =>
      deletionApi.transactions(
        deleting!.rows.map(({ id, version }) => ({ id, version })),
        deleting!.key,
      ),
    onSuccess: (result) => {
      setSelection({ user: session.data?.id, rows: {} });
      setDeleting(undefined);
      void cache.invalidateQueries();
      message.success(tr('已删除 {0} 笔交易，可在回收站恢复', result.deleted));
      const next = new URLSearchParams(params);
      next.delete('page');
      setParams(next);
    },
    onError: (error: ApiError) => message.error(error.message),
  });
  const q = useQuery({
    queryKey: ['transactions', filters, session.data?.id],
    queryFn: ({ signal }) => transactionApi.list(filters, signal),
    staleTime: 30_000,
    refetchInterval: false,
    enabled: issues.length === 0 && !!session.data?.id,
  });
  return (
    <div className="transaction-workspace">
      <div className="page-heading workspace-heading">
        <div>
          <PageTitle>{review ? tr('待整理中心') : tr('全部交易')}</PageTitle>
        </div>
        <Button
          type="primary"
          size="large"
          onClick={() => useUI.getState().openEntry('Expense')}
        >
          {tr('＋ 记一笔')}
        </Button>
      </div>
      {issues.length === 0 && !q.isError && (
        <WorkspaceSummary filters={filters} user={session.data?.id} />
      )}
      <SavedViewPicker params={effectiveParams} onApply={setParams} />
      {issues.length > 0 && (
        <Alert
          className="mb16"
          type="warning"
          showIcon
          message={issues.join('；')}
        />
      )}
      <WorkspaceFilters
        params={effectiveParams}
        filters={filters}
        onApply={setParams}
        review={review}
      />
      <div className="workspace-actions">
        {issues.length === 0 && (
          <TransactionAiPanel
            filters={filters}
            ids={Object.keys(selected)}
            onApply={(query) => {
              const next = new URLSearchParams(params);
              Object.entries(query).forEach(([k, v]) => next.set(k, v));
              next.delete('page');
              setParams(next);
            }}
          />
        )}
        {Object.keys(selected).length > 0 && (
          <Space wrap className="workspace-selection">
            <span>
              {tr(
                '已选择 {0} 笔（跨页保留，最多100笔）',
                Object.keys(selected).length,
              )}
            </span>
            <Button
              disabled={!Object.keys(selected).length}
              onClick={() => setBatchOpen(true)}
            >
              {tr('批量编辑')}
            </Button>
            <Button
              danger
              disabled={
                !Object.keys(selected).length ||
                filters.status === 'Deleted' ||
                remove.isPending
              }
              onClick={() =>
                setDeleting({
                  user: session.data?.id,
                  rows: Object.values(selected),
                  key: crypto.randomUUID(),
                })
              }
            >
              {tr('批量删除')}
            </Button>
            <Button
              onClick={() => setSelection({ user: session.data?.id, rows: {} })}
            >
              {tr('清空选择')}
            </Button>
          </Space>
        )}
      </div>
      {issues.length ? (
        <Alert
          type="warning"
          message={tr('筛选参数无效，请修正后查看结果。')}
        />
      ) : q.isError ? (
        <Card className="workspace-error">
          <h2>{tr('交易列表加载失败')}</h2>
          <p className="muted">{tr('筛选条件已保留，请重试。')}</p>
          <ErrorState
            error={q.error}
            retry={() => {
              void q.refetch();
            }}
          />
        </Card>
      ) : (
        <Card className="table-card">
          <WorkspaceTable
            key={session.data?.id || 'anonymous'}
            user={session.data?.id || 'anonymous'}
            filters={filters}
            visibleFields={visibleColumns(params.get('columns'))}
            items={q.data?.items || []}
            loading={q.isPending || q.isFetching}
            onReview={(t) => setReviewId(t.id)}
            rowSelection={{
              selectedRowKeys: Object.keys(selected),
              preserveSelectedRowKeys: true,
              onChange: (keys) => {
                if (keys.length > 100) {
                  message.warning(tr('每批最多100笔'));
                  return;
                }
                const rows: Record<string, Transaction> = {};
                for (const key of keys) {
                  const t =
                    selected[String(key)] ||
                    q.data?.items.find((t) => t.id === key);
                  if (t) rows[String(key)] = t;
                }
                setSelection({ user: session.data?.id, rows });
              },
            }}
            sort={filters.sort}
            onDetail={(t) => setId(t.id)}
            pagination={{
              current: filters.page,
              pageSize: filters.pageSize,
              total: q.data?.total,
              showSizeChanger: true,
              pageSizeOptions: [20, 50, 100],
              showTotal: (total) => tr('共 {0} 笔', total),
            }}
            onChange={(pagination, _, sorter, extra) => {
              const next = new URLSearchParams(params);
              next.set('page', String(pagination.current || 1));
              next.set('pageSize', String(pagination.pageSize || 20));
              if (extra.action === 'sort') {
                const sorts = (
                  Array.isArray(sorter) ? sorter : [sorter]
                ).filter((s) => s.order);
                next.set(
                  'sort',
                  sorts.length
                    ? sorts
                        .map(
                          (s) =>
                            `${s.field === 'amount' ? 'amount' : 'occurredAt'}:${s.order === 'ascend' ? 'asc' : 'desc'}`,
                        )
                        .join(',')
                    : 'occurredAt:desc',
                );
                next.delete('page');
              }
              setParams(next);
            }}
          />
        </Card>
      )}
      {batchOpen && (
        <BatchDrawer
          key={session.data?.id}
          items={Object.values(selected).map((t) => ({
            id: t.id,
            version: t.version,
          }))}
          onClose={() => setBatchOpen(false)}
          onCompleted={() => setSelection({ user: session.data?.id, rows: {} })}
        />
      )}
      {deleting && deleting.user === session.data?.id && (
        <Modal
          open
          title={tr('批量删除交易')}
          onCancel={() => !remove.isPending && setDeleting(undefined)}
          maskClosable={false}
          closable={!remove.isPending}
          okText={tr('确认删除')}
          cancelText={tr('取消')}
          okButtonProps={{ danger: true }}
          cancelButtonProps={{ disabled: remove.isPending }}
          confirmLoading={remove.isPending}
          onOk={() => remove.mutate()}
        >
          <p>
            {tr(
              '确定删除所选的 {0} 笔交易？删除后可在回收站恢复，账户余额与统计将同步更新。',
              deleting.rows.length,
            )}
          </p>
          <Alert
            type="warning"
            showIcon
            message={tr(
              '若任一交易有版本冲突或受业务关联保护，整批取消，不会部分删除。',
            )}
          />
        </Modal>
      )}
      {reviewId && (
        <ReviewDrawer
          key={reviewId}
          id={reviewId}
          onClose={() => setReviewId(undefined)}
          onEdit={() => setId(reviewId)}
        />
      )}
      <TransactionDrawer id={id} onClose={() => setId(undefined)} />
    </div>
  );
}
