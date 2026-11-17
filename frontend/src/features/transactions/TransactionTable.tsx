import { useEffect, useRef } from 'react';
import { categoryLabel, categoryPath } from '../../utils/categories';
import type { TablePreferences } from './WorkspaceTable';
import { TransactionBalances } from './TransactionBalances';
import { t as tr, useLocale } from '../../i18n';
import {
  Button,
  Card,
  Checkbox,
  Grid,
  Pagination,
  Space,
  Skeleton,
  Table,
  Tag,
} from 'antd';
import type { TableProps } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { accountApi, categoryApi } from '../../api/finance';
import { Money } from '../../components/Money';
import {
  transactionDisplayLabel,
  transactionColors,
} from '../../constants/mappings';
import { formatDate } from '../../utils/finance';
import type { Transaction } from '../../types';
import { EmptyState } from '../../components/Feedback';
import { useUI } from '../../stores/ui';
export function TransactionTable({
  items,
  loading,
  onDetail,
  pagination,
  onChange,
  sort,
  visibleFields,
  rowSelection,
  onReview,
  preferences,
  onWidthChange,
}: {
  preferences?: TablePreferences;
  onWidthChange?: (key: string, width: number) => void;
  items: Transaction[];
  loading?: boolean;
  onDetail: (t: Transaction) => void;
  pagination?: TableProps<Transaction>['pagination'];
  onChange?: TableProps<Transaction>['onChange'];
  sort?: string;
  visibleFields?: string[];
  rowSelection?: TableProps<Transaction>['rowSelection'];
  onReview?: (t: Transaction) => void;
}) {
  useLocale();
  const longPress = useRef<
    { timer: ReturnType<typeof setTimeout>; x: number; y: number } | undefined
  >(undefined);
  const cancelLongPress = () => {
    if (longPress.current) {
      clearTimeout(longPress.current.timer);
      longPress.current = undefined;
    }
  };
  useEffect(
    () => () => {
      if (longPress.current) clearTimeout(longPress.current.timer);
    },
    [],
  );
  const hidden = useUI((s) => s.hidden);
  const screens = Grid.useBreakpoint();
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
  });
  if (screens.md === false)
    return (
      <Space
        direction="vertical"
        className={`mobile-transaction-list density-${preferences?.density || 'standard'}`}
        size={12}
      >
        {rowSelection && (
          <Checkbox
            disabled={loading || items.length === 0}
            checked={
              items.length > 0 &&
              items.every((t) => rowSelection.selectedRowKeys?.includes(t.id))
            }
            indeterminate={
              items.some((t) => rowSelection.selectedRowKeys?.includes(t.id)) &&
              !items.every((t) => rowSelection.selectedRowKeys?.includes(t.id))
            }
            onChange={(e) =>
              rowSelection.onChange?.(
                e.target.checked
                  ? [
                      ...new Set([
                        ...(rowSelection.selectedRowKeys || []),
                        ...items.map((t) => t.id),
                      ]),
                    ]
                  : (rowSelection.selectedRowKeys || []).filter(
                      (key) => !items.some((t) => t.id === key),
                    ),
                items,
                { type: 'all' },
              )
            }
          >
            {tr('选择当前页')}
          </Checkbox>
        )}
        {loading && items.length === 0 ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : items.length === 0 ? (
          <EmptyState
            description={tr('暂无交易，试试调整筛选条件')}
            action={
              onChange ? () => useUI.getState().openEntry('Expense') : undefined
            }
          />
        ) : (
          items.map((t) => (
            <Card
              key={t.id}
              size="small"
              className="mobile-transaction-card"
              onPointerDown={(event) => {
                if (
                  !rowSelection ||
                  (event.target as HTMLElement).closest('button,input,a,label')
                )
                  return;
                cancelLongPress();
                longPress.current = {
                  x: event.clientX,
                  y: event.clientY,
                  timer: setTimeout(() => {
                    const keys = rowSelection.selectedRowKeys || [];
                    rowSelection.onChange?.(
                      keys.includes(t.id)
                        ? keys.filter((k) => k !== t.id)
                        : [...keys, t.id],
                      [t],
                      { type: 'single' },
                    );
                    longPress.current = undefined;
                  }, 550),
                };
              }}
              onPointerMove={(event) => {
                if (
                  longPress.current &&
                  (Math.abs(event.clientX - longPress.current.x) > 10 ||
                    Math.abs(event.clientY - longPress.current.y) > 10)
                )
                  cancelLongPress();
              }}
              onPointerUp={cancelLongPress}
              onPointerCancel={cancelLongPress}
              onContextMenu={(e) => {
                if (rowSelection) e.preventDefault();
              }}
            >
              <div className="mobile-transaction-meta">
                <span className="mobile-transaction-date">
                  {formatDate(t.occurredAt, true, true)}
                  <br />
                  {transactionDisplayLabel(t)}
                </span>
                <span className="mobile-transaction-amount">
                  <Money value={t.amount} currency={t.currency} type={t.type} />
                </span>
              </div>
              <div className="mobile-transaction-context">
                {hidden ? '••••' : t.merchant || tr('未填写商户')} ·{' '}
                {hidden
                  ? '••••'
                  : accounts.data?.find((a) => a.id === t.accountId)?.name ||
                    tr('账户')}{' '}
                ·{' '}
                {hidden
                  ? '••••'
                  : categories.data?.find((c) => c.id === t.categoryId)?.name ||
                    tr('多分类 / 未分类')}
              </div>
              <TransactionBalances transaction={t} />
              {t.productName && (
                <div className="mobile-transaction-context">
                  {tr('商品名')}：{hidden ? '••••' : t.productName}
                </div>
              )}
              {t.note && (
                <div className="mobile-transaction-context">
                  {hidden ? '••••' : t.note}
                </div>
              )}
              <div className="mobile-transaction-actions">
                {rowSelection ? (
                  <Checkbox
                    aria-label={tr('选择交易 {0}', t.id)}
                    checked={rowSelection.selectedRowKeys?.includes(t.id)}
                    disabled={loading}
                    onChange={(e) =>
                      rowSelection.onChange?.(
                        e.target.checked
                          ? [...(rowSelection.selectedRowKeys || []), t.id]
                          : (rowSelection.selectedRowKeys || []).filter(
                              (key) => key !== t.id,
                            ),
                        [t],
                        { type: 'single' },
                      )
                    }
                  >
                    {tr('选择')}
                  </Checkbox>
                ) : (
                  <span />
                )}
                <Space wrap>
                  <Button aria-label={tr('详情')} onClick={() => onDetail(t)}>
                    {tr('详情')}
                  </Button>
                  {onReview && (
                    <Button onClick={() => onReview(t)}>
                      {tr('处理问题')}
                    </Button>
                  )}
                </Space>
              </div>
            </Card>
          ))
        )}
        {pagination && (
          <Pagination
            {...pagination}
            onChange={(page, pageSize) =>
              onChange?.(
                { current: page, pageSize },
                {},
                {},
                { currentDataSource: items, action: 'paginate' },
              )
            }
          />
        )}
      </Space>
    );
  return (
    <Table<Transaction>
      className={`workspace-table density-${preferences?.density || 'standard'}`}
      size={
        preferences?.density === 'compact'
          ? 'small'
          : preferences?.density === 'comfortable'
            ? 'large'
            : 'middle'
      }
      sticky
      tableLayout="fixed"
      rowKey="id"
      rowSelection={rowSelection}
      dataSource={items}
      loading={loading}
      scroll={{ x: 1200 }}
      pagination={pagination ?? false}
      onChange={onChange}
      locale={{
        emptyText: (
          <EmptyState
            description={tr('暂无交易，试试调整筛选条件')}
            action={
              onChange ? () => useUI.getState().openEntry('Expense') : undefined
            }
          />
        ),
      }}
      columns={(
        [
          {
            key: 'date',
            title: tr('日期'),
            dataIndex: 'occurredAt',
            sorter: onChange ? { multiple: 2 } : false,
            sortOrder: sort?.split(',').some((v) => v.startsWith('occurredAt:'))
              ? sort
                  .split(',')
                  .find((v) => v.startsWith('occurredAt:'))
                  ?.endsWith(':asc')
                ? 'ascend'
                : 'descend'
              : null,
            render: (v: string) => formatDate(v, true, true),
            width: 185,
          },
          {
            title: tr('类型'),
            key: 'type',
            dataIndex: 'type',
            render: (v: Transaction['type'], record: Transaction) => (
              <Tag color={transactionColors[v]}>
                {transactionDisplayLabel(record)}
              </Tag>
            ),
            width: 105,
          },
          {
            title: tr('账户'),
            key: 'account',
            render: (_, t) =>
              hidden
                ? '••••'
                : [
                    accounts.data?.find((a) => a.id === t.accountId)?.name,
                    t.toAccountId
                      ? accounts.data?.find((a) => a.id === t.toAccountId)?.name
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(' → '),
            width: 140,
          },
          {
            title: tr('一级分类'),
            key: 'parentCategory',
            render: (_, t) => {
              if (t.splits.length) return '多分类拆分';
              const category = categories.data?.find(
                (c) => c.id === t.categoryId,
              );
              return (
                categoryPath(categories.data || [], category?.id || '')[0]
                  ?.name || '—'
              );
            },
            width: 120,
          },
          {
            title: tr('分类路径'),
            key: 'category',
            render: (_, t) =>
              t.splits.length
                ? '多分类拆分'
                : categoryLabel(categories.data || [], t.categoryId || '') ||
                  '—',
            width: 120,
          },
          {
            title: tr('商户 / 对象'),
            key: 'merchant',
            dataIndex: 'merchant',
            render: (v: string, record: Transaction) =>
              hidden ? (
                '••••'
              ) : (
                <div>
                  {v || '—'}
                  {record.productName && (
                    <div
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: 12,
                        overflowWrap: 'anywhere',
                        whiteSpace: 'normal',
                      }}
                    >
                      {tr('商品名')}：{record.productName}
                    </div>
                  )}
                </div>
              ),
            ellipsis: true,
          },
          {
            title: tr('金额'),
            key: 'amount',
            dataIndex: 'amount',
            align: 'right',
            sorter: onChange ? { multiple: 1 } : false,
            sortOrder: sort?.split(',').some((v) => v.startsWith('amount:'))
              ? sort.endsWith(':asc')
                ? 'ascend'
                : 'descend'
              : null,
            render: (_, t) => (
              <div>
                <Money
                  value={t.amount}
                  currency={t.currency}
                  type={t.type}
                  adjustmentDirection={t.adjustmentDirection}
                />
              </div>
            ),
            width: 150,
          },
          {
            title: tr('交易后余额'),
            key: 'balance',
            align: 'right',
            width: 170,
            render: (_, t) => <TransactionBalances transaction={t} />,
          },
          {
            title: tr('项目'),
            key: 'project',
            render: (_, t) =>
              hidden
                ? '••••'
                : t.projectName || (t.projectId ? '关联项目' : '—'),
            width: 120,
          },
          {
            title: tr('标签'),
            key: 'tags',
            render: (_, t) =>
              hidden
                ? '••••'
                : t.tagNames?.join('、') ||
                  (t.tagIds.length ? '关联标签' : '—'),
            width: 110,
          },
          {
            title: tr('备注'),
            key: 'note',
            dataIndex: 'note',
            ellipsis: true,
            render: (v: string) => (hidden ? '••••' : v || '—'),
          },
          {
            title: tr('状态'),
            key: 'status',
            render: (_, t) =>
              t.status === 'Deleted' ? (
                <Tag>{tr('已删除')}</Tag>
              ) : t.categoryId === 'unknown' || t.status === 'NeedsReview' ? (
                <Tag color="orange">{tr('⚠ 待确认')}</Tag>
              ) : (
                <span className="muted">{tr('已确认')}</span>
              ),
            width: 90,
          },
          {
            title: tr('操作'),
            key: 'actions',
            render: (_, t) => (
              <Space>
                <Button type="link" onClick={() => onDetail(t)}>
                  {tr('详情')}
                </Button>
                {onReview && (
                  <Button type="link" onClick={() => onReview(t)}>
                    {tr('处理问题')}
                  </Button>
                )}
              </Space>
            ),
            width: onReview ? 160 : 80,
          },
        ] satisfies NonNullable<TableProps<Transaction>['columns']>
      )
        .filter(
          (column) => !visibleFields || visibleFields.includes(column.key),
        )
        .sort(
          (a, b) =>
            (preferences?.order.indexOf(a.key) ?? 0) -
            (preferences?.order.indexOf(b.key) ?? 0),
        )
        .map((column) => ({
          ...column,
          width: preferences?.widths[column.key] || column.width || 150,
          fixed: preferences?.frozen.includes(column.key)
            ? ('left' as const)
            : undefined,
          title: (
            <div className="workspace-column-title">
              {column.title}
              {onWidthChange && (
                <span
                  role="separator"
                  aria-label={tr('调整列宽')}
                  aria-orientation="vertical"
                  tabIndex={0}
                  className="workspace-column-resize"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                      e.preventDefault();
                      onWidthChange(
                        column.key,
                        Math.max(
                          70,
                          Math.min(
                            600,
                            (preferences?.widths[column.key] ||
                              column.width ||
                              150) + (e.key === 'ArrowLeft' ? -10 : 10),
                          ),
                        ),
                      );
                    }
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const x = e.clientX;
                    const width =
                      preferences?.widths[column.key] || column.width || 150;
                    const handle = e.currentTarget;
                    handle.setPointerCapture(e.pointerId);
                    handle.onpointerup = (event) => {
                      onWidthChange(
                        column.key,
                        Math.max(70, Math.min(600, width + event.clientX - x)),
                      );
                      handle.onpointerup = null;
                    };
                  }}
                />
              )}
            </div>
          ),
        }))}
    />
  );
}
