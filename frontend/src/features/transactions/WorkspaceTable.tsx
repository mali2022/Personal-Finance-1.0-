import { useMobile } from '../../hooks/useMobile';
import { useState } from 'react';
import {
  App,
  Alert,
  Button,
  Checkbox,
  Drawer,
  InputNumber,
  Pagination,
  Select,
  Space,
} from 'antd';
import { TransactionTable } from './TransactionTable';
import { transactionColumns } from './savedViews';
import { t as tr, useLocale } from '../../i18n';
import { formatDate, formatMoney } from '../../utils/finance';
import type { ComponentProps } from 'react';
import type { TransactionFilters } from '../../types';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { useUI } from '../../stores/ui';

export interface TablePreferences {
  density: 'compact' | 'standard' | 'comfortable';
  order: string[];
  widths: Record<string, number>;
  frozen: string[];
  grouped: boolean;
}
export const defaultTablePreferences: TablePreferences = {
  density: 'standard',
  order: transactionColumns.map(([key]) => key),
  widths: {},
  frozen: ['date'],
  grouped: false,
};
const storageKey = (user: string) =>
  `finance-transaction-table:v1:${encodeURIComponent(user)}`;
export function readTablePreferences(user: string): TablePreferences {
  const raw = localStorage.getItem(storageKey(user));
  if (!raw) return structuredClone(defaultTablePreferences);
  const value = JSON.parse(raw) as TablePreferences;
  if (
    !['compact', 'standard', 'comfortable'].includes(value.density) ||
    !Array.isArray(value.order) ||
    !Array.isArray(value.frozen) ||
    typeof value.grouped !== 'boolean' ||
    !value.widths ||
    Object.values(value.widths).some(
      (w) => !Number.isFinite(w) || w < 70 || w > 600,
    )
  )
    throw new Error('表格配置无效');
  const known = transactionColumns.map(([key]) => String(key));
  return {
    ...value,
    order: [
      ...new Set([
        ...value.order.filter((key) => known.includes(key)),
        ...known,
      ]),
    ],
    frozen: value.frozen.filter((key) => known.includes(key)),
  };
}
export function WorkspaceTable({
  user,
  filters,
  ...props
}: ComponentProps<typeof TransactionTable> & {
  user: string;
  filters: TransactionFilters;
}) {
  useLocale();
  const mobile = useMobile();
  const { message } = App.useApp();
  const hidden = useUI((s) => s.hidden);
  const [storageProblem, setStorageProblem] = useState(() => {
    try {
      readTablePreferences(user);
      return false;
    } catch {
      return true;
    }
  });
  const [settings, setSettings] = useState(() => {
    try {
      return readTablePreferences(user);
    } catch {
      return structuredClone(defaultTablePreferences);
    }
  });
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<string>();
  const update = (patch: Partial<TablePreferences>) => {
    if (storageProblem) {
      message.error(
        tr('表格配置损坏，原数据已保留。可在表格配置中恢复默认布局。'),
      );
      return;
    }
    const next = { ...settings, ...patch };
    try {
      localStorage.setItem(storageKey(user), JSON.stringify(next));
      setSettings(next);
    } catch {
      message.error(tr('无法保存表格配置，请检查浏览器存储权限。'));
    }
  };
  const move = (key: string, target: string) => {
    if (key === target) return;
    const order = settings.order.filter((k) => k !== key);
    order.splice(order.indexOf(target), 0, key);
    update({ order });
  };
  const days = [...new Set(props.items.map((t) => formatDate(t.occurredAt)))];
  const daily = useQuery({
    queryKey: ['transactions', 'daily', user, filters, days],
    refetchInterval: false,
    enabled: (mobile || settings.grouped) && days.length > 0,
    queryFn: () =>
      apiClient
        .get<{
          data: {
            day: string;
            currency: string;
            income: string;
            expense: string;
          }[];
        }>('/transactions/daily-summary', {
          params: { ...filters, days: days.join(',') },
        })
        .then((r) => r.data.data),
  });
  return (
    <>
      {storageProblem && (
        <Alert
          type="warning"
          showIcon
          message={tr(
            '表格配置损坏，原数据已保留。可在表格配置中恢复默认布局。',
          )}
        />
      )}
      <div className="workspace-list-toolbar">
        <Space wrap>
          <Select
            aria-label={tr('列表密度')}
            value={settings.density}
            onChange={(density) => update({ density })}
            options={['compact', 'standard', 'comfortable'].map((value, i) => ({
              value,
              label: tr(['紧凑', '标准', '舒适'][i]),
            }))}
          />
          <Checkbox
            checked={mobile || settings.grouped}
            disabled={mobile}
            onChange={(e) => update({ grouped: e.target.checked })}
          >
            {tr('按日期分组')}
          </Checkbox>
          <Button onClick={() => setOpen(true)}>{tr('表格配置')}</Button>
        </Space>
        <span className="muted">
          {tr('共 {0} 笔', (props.pagination && props.pagination.total) || 0)}
        </span>
      </div>
      {(mobile || settings.grouped) && props.items.length > 0 ? (
        <>
          {days.map((day) => (
            <section key={day} className="workspace-day">
              <h3>
                {day}{' '}
                <small>
                  {daily.isError
                    ? tr('每日小计加载失败')
                    : daily.isPending
                      ? tr('加载中…')
                      : daily.data
                          ?.filter((d) => d.day === day)
                          .map(
                            (d) =>
                              `${d.currency} · ${tr('收入')} ${formatMoney(d.income, d.currency, hidden)} · ${tr('支出')} ${formatMoney(d.expense, d.currency, hidden)}`,
                          )
                          .join(' / ')}
                </small>
              </h3>
              <TransactionTable
                {...props}
                preferences={settings}
                onWidthChange={(key, width) =>
                  update({ widths: { ...settings.widths, [key]: width } })
                }
                items={props.items.filter(
                  (t) => formatDate(t.occurredAt) === day,
                )}
                pagination={false}
              />
            </section>
          ))}
          {props.pagination && (
            <Pagination
              {...props.pagination}
              onChange={(page, pageSize) =>
                props.onChange?.(
                  { current: page, pageSize },
                  {},
                  {},
                  { currentDataSource: props.items, action: 'paginate' },
                )
              }
            />
          )}{' '}
        </>
      ) : (
        <TransactionTable
          {...props}
          preferences={settings}
          onWidthChange={(key, width) =>
            update({ widths: { ...settings.widths, [key]: width } })
          }
        />
      )}
      <Drawer
        title={tr('表格配置')}
        open={open}
        onClose={() => setOpen(false)}
        width="min(480px,100vw)"
      >
        <p>
          {tr('拖拽字段调整顺序，或使用上移按钮。列宽也可拖动表头右侧调整。')}
        </p>
        {settings.order.map((key, index) => (
          <div
            key={key}
            className="workspace-column-config"
            draggable
            onDragStart={() => setDrag(key)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag) move(drag, key);
              setDrag(undefined);
            }}
          >
            <span>⠿ {transactionColumns.find((c) => c[0] === key)?.[1]}</span>
            <InputNumber
              aria-label={`${tr('列宽')} ${key}`}
              min={70}
              max={600}
              value={settings.widths[key] || 140}
              onChange={(value) => {
                if (value)
                  update({ widths: { ...settings.widths, [key]: value } });
              }}
            />
            <Checkbox
              checked={settings.frozen.includes(key)}
              onChange={(e) =>
                update({
                  frozen: e.target.checked
                    ? [...settings.frozen, key]
                    : settings.frozen.filter((k) => k !== key),
                })
              }
            >
              {tr('冻结')}
            </Checkbox>
            <Button
              disabled={index === 0}
              onClick={() => move(key, settings.order[index - 1])}
            >
              {tr('上移')}
            </Button>
          </div>
        ))}
        <Button
          onClick={() => {
            try {
              const next = structuredClone(defaultTablePreferences);
              localStorage.setItem(storageKey(user), JSON.stringify(next));
              setSettings(next);
              setStorageProblem(false);
            } catch {
              message.error(tr('无法保存表格配置，请检查浏览器存储权限。'));
            }
          }}
        >
          {tr('恢复默认布局')}
        </Button>
      </Drawer>
    </>
  );
}
