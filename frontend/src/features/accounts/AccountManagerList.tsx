import { CURRENCY_CODES } from '../../constants/currencies';
import { Select } from '../../components/TouchSelect';
import { t as tr, useLocale } from '../../i18n';
import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Collapse,
  Dropdown,
  Empty,
  Input,
  Modal,
  Space,
  Table,
  Tag,
} from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { Account, ApiError } from '../../types';
import { accounts2Api } from '../../api/accounts2';
import { accountApi } from '../../api/finance';
import { accountLabels } from '../../constants/mappings';
import { Sensitive } from '../../components/Sensitive';
import { Money } from '../../components/Money';

import { useUI } from '../../stores/ui';
import {
  accountNature,
  balancePresentation,
  summarizeAccounts,
  type AccountFilters,
  defaultFilters,
  filterAccounts,
} from './accountView';
import './accounts.css';
export function AccountActions({
  account: a,
  onEdit,
}: {
  account: Account;
  onEdit: (a: Account) => void;
}) {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const { modal, message } = App.useApp();
  const cache = useQueryClient();
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    if (useUI.getState().defaultAccount === a.id)
      useUI.getState().setDefaultAccount('');
    await cache.invalidateQueries({ queryKey: ['accounts'] });
    await cache.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const archive = () =>
    modal.confirm({
      title: a.status === 'Archived' ? tr('恢复账户使用') : tr('归档账户'),
      content: tr(
        '归档保留历史、统计和审计，并取消默认账户设置；有效周期规则须先暂停或迁移。',
      ),
      onOk: async () => {
        await accounts2Api.archive(a, a.status === 'Archived');
        await refresh();
        message.success(tr('账户状态已更新'));
      },
    });
  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const preview = await accounts2Api.preview(a.id);
      if (!preview.allowed) {
        modal.confirm({
          title: tr('账户存在历史或关联记录'),
          okText: a.status === 'Archived' ? tr('知道了') : tr('归档账户'),
          content: (
            <>
              <p>{tr('账户历史记录需要保留，余额为零也不能永久删除。归档后仍可查询历史。')}</p>
              {preview.reasons.map((reason) => <p key={reason}>{reason}</p>)}
            </>
          ),
          onOk: async () => {
            if (a.status === 'Archived') return;
            await accounts2Api.archive({ ...a, version: preview.version }, false);
            await refresh();
            message.success(tr('账户状态已更新'));
          },
          okButtonProps: { disabled: a.status === 'Closed' },
        });
        return;
      }
      modal.confirm({
        title: tr('永久删除账户确认'),
        okText: tr('永久删除'),
        okButtonProps: { danger: true, disabled: !preview.allowed },
        content: (
          <>
            <p>
              {tr('历史交易')}
              {preview.historicalTransactionCount} {tr('笔，资金分录')}
              {preview.ledgerEntryCount} {tr('行。')}
            </p>
            <p>
              {tr('当前余额')}
              <Money value={preview.balance} currency={a.currency} />
            </p>
            {preview.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
            <p>{tr('删除仅限无资金事实、无引用档案；历史账户建议归档。')}</p>
          </>
        ),
        onOk: async () => {
          await accounts2Api.remove({ ...a, version: preview.version });
          await refresh();
          message.success(tr('空账户已删除，审计保留'));
        },
      });
    } catch (error) {
      message.error((error as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dropdown
      menu={{
        items: [
          { key: 'edit', label: tr('编辑账户') },
          { key: 'pin', label: a.isPinned ? tr('取消置顶') : tr('置顶') },
          {
            key: 'archive',
            label: a.status === 'Archived' ? tr('取消归档') : tr('归档账户'),
          },
          { key: 'delete', danger: true, label: tr('删除账户') },
        ],
        onClick: ({ key }) => {
          if (key === 'edit') onEdit(a);
          if (key === 'pin')
            void accountApi
              .save({ ...a, isPinned: !a.isPinned }, a.id)
              .then(() => cache.invalidateQueries({ queryKey: ['accounts'] }))
              .catch((e) => message.error((e as ApiError).message));
          if (key === 'archive') archive();
          if (key === 'delete') void remove();
        },
      }}
    >
      <Button
        loading={busy}
        aria-label={hidden ? tr('管理账户') : tr('管理{0}', a.name)}
      >
        {tr('账户操作')}
      </Button>
    </Dropdown>
  );
}
export function AccountManagerList({
  accounts,
  onEdit,
}: {
  accounts: Account[];
  onEdit: (a: Account) => void;
}) {
  useLocale();
  const hidden = useUI((s) => s.hidden),
    cache = useQueryClient(),
    { message, modal } = App.useApp(),
    navigate = useNavigate();
  const [f, setF] = useState<AccountFilters>(() => {
    try {
      return {
        ...defaultFilters,
        ...JSON.parse(localStorage.getItem('account-filters-v1') || '{}'),
      };
    } catch {
      return defaultFilters;
    }
  });
  const [summaryClosed, setSummaryClosed] = useState(
    () => localStorage.getItem('account-summary-closed') === 'true',
  );
  const [advanced, setAdvanced] = useState(false),
    [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('account-groups-closed') || '[]');
    } catch {
      return [];
    }
  });
  const groups = useQuery({
    queryKey: ['account-groups'],
    queryFn: accounts2Api.groups,
  });
  const update = (patch: Partial<AccountFilters>) =>
    setF((v) => ({ ...v, ...patch }));
  const visible = filterAccounts(accounts, f),
    summary = summarizeAccounts(accounts);
  const statusLabel = (s: string) =>
    tr(
      (
        {
          Active: '启用',
          Paused: '暂停',
          Disabled: '停用',
          Archived: '归档',
          Closed: '已销户',
        } as Record<string, string>
      )[s] || s,
    );
  const reorder = async (a: Account, b: Account) => {
    if (busy || f.sort !== 'custom' || a.id === b.id) return;
    if (a.groupId !== b.groupId || !!a.isPinned !== !!b.isPinned) {
      message.info(tr('只在相同账户分组内移动'));
      return;
    }
    const ordered = [...accounts];
    const from = ordered.findIndex((x) => x.id === a.id),
      to = ordered.findIndex((x) => x.id === b.id);
    ordered.splice(from, 1);
    ordered.splice(to, 0, a);
    setBusy(true);
    try {
      await accounts2Api.reorder(ordered);
      await cache.invalidateQueries({ queryKey: ['accounts'] });
    } catch (e) {
      message.error((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const siblings = (a: Account) =>
    visible.filter(
      (x) => x.groupId === a.groupId && !!x.isPinned === !!a.isPinned,
    );
  const move = (a: Account, d: number) => {
    const rows = siblings(a),
      target = rows[rows.findIndex((x) => x.id === a.id) + d];
    if (target) void reorder(a, target);
  };
  const orderButtons = (a: Account) => {
    const rows = siblings(a),
      index = rows.findIndex((x) => x.id === a.id);
    return (
      f.sort === 'custom' && (
        <Space size={4}>
          <Button
            size="small"
            aria-label={hidden ? tr('账户上移') : tr('{0}上移', a.name)}
            disabled={busy || index === 0}
            onClick={() => move(a, -1)}
          >
            {tr('上移')}
          </Button>
          <Button
            size="small"
            aria-label={hidden ? tr('账户下移') : tr('{0}下移', a.name)}
            disabled={busy || index === rows.length - 1}
            onClick={() => move(a, 1)}
          >
            {tr('下移')}
          </Button>
        </Space>
      )
    );
  };
  const knownGroups = groups.data || [];
  const unknownGroups = [
    ...new Set(
      visible
        .map((a) => a.groupId)
        .filter(
          (id): id is string => !!id && !knownGroups.some((g) => g.id === id),
        ),
    ),
  ].map((id) => ({ id, name: tr('账户分组') }));
  const sections = [
    { id: '', name: tr('未分组') },
    ...knownGroups,
    ...unknownGroups,
  ]
    .map((g) => ({
      ...g,
      rows: visible.filter((a) => (a.groupId || '') === g.id),
    }))
    .filter((g) => g.rows.length);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const removeGroup = (id: string) => {
    const g = groups.data?.find((x) => x.id === id);
    if (!g) return;
    const dialog = modal.confirm({
      title: tr('删除账户分组'),
      okText: tr('删除分组'),
      content: tr('该分组内的账户将移至未分组，保留余额、历史及原有排序值。'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await accounts2Api.removeGroup(g);
          update({ group: undefined });
          setClosed((v) => v.filter((k) => k !== g.id));
          await Promise.all([
            cache.invalidateQueries({ queryKey: ['account-groups'] }),
            cache.invalidateQueries({ queryKey: ['accounts'] }),
          ]);
          message.success(tr('账户分组已删除，账户已移至未分组'));
        } catch (error) {
          message.error(
            (error as ApiError).message || tr('删除分组失败，请重试'),
          );
          await cache.invalidateQueries({ queryKey: ['account-groups'] });
          dialog.destroy();
          setGroupManagerOpen(true);
        }
      },
    });
  };
  return (
    <div className="account-manager">
      <Modal
        title={tr('选择要删除的账户分组')}
        open={groupManagerOpen}
        footer={null}
        onCancel={() => setGroupManagerOpen(false)}
      >
        <p className="muted">{tr('删除分组不会删除账户、余额或历史记录。')}</p>
        {groups.data?.length ? (
          groups.data.map((g) => (
            <div
              key={g.id}
              className="account-section-heading"
              style={{ padding: '12px 0' }}
            >
              <Sensitive>{g.name}</Sensitive>
              <Button
                danger
                aria-label={
                  hidden ? tr('删除账户分组') : tr('删除分组 {0}', g.name)
                }
                onClick={() => {
                  setGroupManagerOpen(false);
                  removeGroup(g.id);
                }}
              >
                {tr('删除分组')}
              </Button>
            </div>
          ))
        ) : (
          <Empty description={tr('暂无账户分组')} />
        )}
      </Modal>
      {groups.isError && (
        <Alert
          type="warning"
          message={tr('账户分组加载失败')}
          action={
            <Button onClick={() => groups.refetch()}>{tr('重试')}</Button>
          }
        />
      )}
      <section className="account-overview" aria-label={tr('账户资金摘要')}>
        <div className="account-section-heading">
          <h2>{tr('账户总览')}</h2>
          <Button
            type="text"
            aria-expanded={!summaryClosed}
            onClick={() => {
              setSummaryClosed(!summaryClosed);
              localStorage.setItem(
                'account-summary-closed',
                String(!summaryClosed),
              );
            }}
          >
            {summaryClosed ? tr('展开摘要') : tr('折叠摘要')}
          </Button>
        </div>
        {!summaryClosed && (
          <>
            <div className="account-summary-grid">
              {(['assets', 'debt', 'net', 'available'] as const).map(
                (key, i) => (
                  <div key={key}>
                    <span className="muted">
                      {tr(['账户资产', '账户负债', '账户净额', '可用资金'][i])}
                    </span>
                    {summary.map((s) => (
                      <div
                        key={s.currency}
                        className={
                          s.currency === 'CNY'
                            ? 'account-summary-value'
                            : 'account-summary-secondary'
                        }
                      >
                        <span>{s.currency}</span>{' '}
                        <Money value={s[key]} currency={s.currency} />
                      </div>
                    ))}
                  </div>
                ),
              )}
            </div>
            {accounts.some((a) => a.availableBalance === undefined) && (
              <Alert
                type="warning"
                message={tr(
                  '部分账户缺少可用余额数据，可用资金摘要暂不完整，请刷新后重试。',
                )}
              />
            )}
          </>
        )}
        <Space wrap>
          <Tag>
            {tr('全部账户')} <Sensitive>{accounts.length}</Sensitive>
          </Tag>
          <Tag color="green">
            {tr('启用')}{' '}
            <Sensitive>
              {accounts.filter((a) => a.status === 'Active').length}
            </Sensitive>
          </Tag>
          <Tag>
            {tr('归档')}{' '}
            <Sensitive>
              {accounts.filter((a) => a.status === 'Archived').length}
            </Sensitive>
          </Tag>
        </Space>
      </section>
      <section className="account-filter-panel" aria-label={tr('账户筛选')}>
        <div className="account-primary-filters">
          <Input
            allowClear
            aria-label={tr('搜索账户')}
            placeholder={tr('搜索名称、机构、尾号…')}
            value={f.search}
            onChange={(e) => update({ search: e.target.value })}
          />
          <Select
            aria-label={tr('账户性质')}
            value={f.nature}
            onChange={(nature) => update({ nature })}
            options={[
              { value: 'all', label: tr('全部账户') },
              { value: 'asset', label: tr('资产账户') },
              { value: 'liability', label: tr('负债账户') },
            ]}
          />
          <Select
            aria-label={tr('账户状态筛选')}
            allowClear
            value={f.status}
            onChange={(status) => update({ status })}
            options={[
              { value: 'main', label: tr('主要账户') },
              ...['Active', 'Paused', 'Disabled', 'Archived', 'Closed'].map(
                (value) => ({ value, label: statusLabel(value) }),
              ),
            ]}
          />
          <Select
            aria-label={tr('账户排序')}
            value={f.sort}
            onChange={(sort) => update({ sort })}
            options={[
              { value: 'custom', label: tr('自定义顺序') },
              { value: 'name', label: tr('名称') },
              { value: 'type', label: tr('类型') },
              { value: 'balance', label: tr('余额（原币）') },
              { value: 'created', label: tr('创建时间') },
              { value: 'recent', label: tr('最近资金活动') },
            ]}
          />
        </div>
        <Space wrap className="mt20">
          <Button
            aria-expanded={advanced}
            onClick={() => setAdvanced(!advanced)}
          >
            {tr('高级筛选')}
            {advanced ? ' −' : ' ＋'}
          </Button>
          <Checkbox
            checked={f.hideZero}
            onChange={(e) => update({ hideZero: e.target.checked })}
          >
            {tr('隐藏零余额账户')}
          </Checkbox>
          <Button onClick={() => setF({ ...defaultFilters })}>
            {tr('清空筛选')}
          </Button>
          <Button
            onClick={() => {
              try {
                localStorage.setItem(
                  'account-filters-v1',
                  JSON.stringify({ ...f, search: '' }),
                );
                message.success(tr('筛选偏好已保存'));
              } catch {
                message.error(tr('无法保存筛选偏好'));
              }
            }}
          >
            {tr('保存筛选偏好')}
          </Button>
          <span className="muted">
            {tr('显示')}{' '}
            <Sensitive>
              {visible.length} / {accounts.length}
            </Sensitive>
          </span>
        </Space>
        {advanced && (
          <div className="account-advanced-filters">
            <Select
              aria-label={tr('账户类型筛选')}
              allowClear
              placeholder={tr('全部类型')}
              value={f.type}
              onChange={(type) => update({ type })}
              options={Object.entries(accountLabels).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <Select
              aria-label={tr('账户币种筛选')}
              allowClear
              placeholder={tr('全部币种')}
              value={f.currency}
              onChange={(currency) => update({ currency })}
              options={CURRENCY_CODES.map((value) => ({ value, label: value }))}
            />
            <Select
              aria-label={tr('账户分组筛选')}
              allowClear
              placeholder={tr('全部分组')}
              value={f.group}
              onChange={(group) => update({ group })}
              options={groups.data?.map((g) => ({
                value: g.id,
                label: g.name,
              }))}
            />
            <Select
              aria-label={tr('账户标记筛选')}
              allowClear
              placeholder={tr('全部标记')}
              value={f.flag}
              onChange={(flag) => update({ flag })}
              options={[
                { value: 'pinned', label: tr('置顶') },
                { value: 'default', label: tr('默认账户') },
              ]}
            />
            <Select
              aria-label={tr('账户列表模式')}
              value={f.mode}
              onChange={(mode) => update({ mode })}
              options={[
                { value: 'cards', label: tr('卡片') },
                { value: 'table', label: tr('表格') },
              ]}
            />
          </div>
        )}
      </section>
      <div className="account-section-heading">
        <Space wrap>
          <Button
            onClick={() => {
              let name = '';
              modal.confirm({
                title: tr('新增账户分组'),
                content: (
                  <Input
                    aria-label={tr('新分组名称')}
                    maxLength={100}
                    onChange={(e) => {
                      name = e.target.value;
                    }}
                  />
                ),
                onOk: async () => {
                  await accounts2Api.addGroup(name);
                  await cache.invalidateQueries({
                    queryKey: ['account-groups'],
                  });
                },
              });
            }}
          >
            {tr('新增分组')}
          </Button>
          <Button
            disabled={!groups.data?.length}
            onClick={() => setGroupManagerOpen(true)}
          >
            {tr('删除分组')}
          </Button>
        </Space>
        <Button
          disabled={busy}
          onClick={() =>
            modal.confirm({
              title: tr('恢复默认顺序'),
              content: tr('将按账户名称恢复默认顺序。'),
              onOk: async () => {
                setBusy(true);
                try {
                  await accounts2Api.reorder(accounts, true);
                  await cache.invalidateQueries({ queryKey: ['accounts'] });
                } finally {
                  setBusy(false);
                }
              },
            })
          }
        >
          {tr('恢复默认顺序')}
        </Button>
      </div>
      {!visible.length ? (
        <Empty description={tr('没有符合条件的账户')} />
      ) : (
        <Collapse
          className="account-group-list"
          activeKey={sections
            .filter((g) => !closed.includes(g.id || 'ungrouped'))
            .map((g) => g.id || 'ungrouped')}
          onChange={(keys) => {
            const active = Array.isArray(keys) ? keys : [keys];
            const next = [
              ...closed.filter(
                (k) => !sections.some((g) => (g.id || 'ungrouped') === k),
              ),
              ...sections
                .map((g) => g.id || 'ungrouped')
                .filter((k) => !active.includes(k)),
            ];
            setClosed(next);
            localStorage.setItem('account-groups-closed', JSON.stringify(next));
          }}
          items={sections.map((g) => ({
            key: g.id || 'ungrouped',
            label: (
              <span>
                <Sensitive>{g.name}</Sensitive>{' '}
                <span className="muted">({g.rows.length})</span>
              </span>
            ),
            children:
              f.mode === 'table' ? (
                <Table
                  rowKey="id"
                  scroll={{ x: 780 }}
                  dataSource={g.rows}
                  pagination={{ pageSize: 20 }}
                  columns={[
                    {
                      title: tr('账户'),
                      render: (_, a) => (
                        <Button
                          type="link"
                          onClick={() => navigate(`/accounts/${a.id}`)}
                        >
                          <Sensitive>{a.name}</Sensitive>
                        </Button>
                      ),
                    },
                    {
                      title: tr('机构'),
                      render: (_, a) => (
                        <Sensitive>{a.institution || '—'}</Sensitive>
                      ),
                    },
                    {
                      title: tr('类型'),
                      render: (_, a) => accountLabels[a.type],
                    },
                    {
                      title: tr('余额 / 欠款'),
                      render: (_, a) => {
                        const b = balancePresentation(a);
                        return (
                          <>
                            <Money value={b.value} currency={a.currency} />
                            <div
                              className={
                                b.warning ? 'account-warning' : 'muted'
                              }
                            >
                              {tr(b.label)}
                            </div>
                          </>
                        );
                      },
                    },
                    {
                      title: tr('状态'),
                      render: (_, a) => statusLabel(a.status),
                    },
                    { title: tr('排序'), render: (_, a) => orderButtons(a) },
                    {
                      title: tr('操作'),
                      render: (_, a) => (
                        <AccountActions account={a} onEdit={onEdit} />
                      ),
                    },
                  ]}
                />
              ) : (
                <div className="account-manager-row-list">
                  {g.rows.map((a) => {
                    const b = balancePresentation(a);
                    return (
                      <article
                        className="account-manager-row"
                        key={a.id}
                        data-account-id={a.id}
                        onDragOver={(e) => {
                          if (f.sort === 'custom') e.preventDefault();
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const from = accounts.find(
                            (x) =>
                              x.id === e.dataTransfer.getData('text/plain'),
                          );
                          if (from) void reorder(from, a);
                        }}
                      >
                        {f.sort === 'custom' && (
                          <button
                            className="account-drag-handle"
                            draggable={!busy}
                            disabled={busy}
                            aria-label={
                              hidden ? tr('排序账户') : tr('排序 {0}', a.name)
                            }
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', a.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onKeyDown={(e) => {
                              if (
                                e.altKey &&
                                ['ArrowUp', 'ArrowDown'].includes(e.key)
                              ) {
                                e.preventDefault();
                                move(a, e.key === 'ArrowUp' ? -1 : 1);
                              }
                            }}
                          >
                            ⠿
                          </button>
                        )}
                        <div className="account-manager-row-name">
                          <Button
                            type="text"
                            onClick={() => navigate(`/accounts/${a.id}`)}
                          >
                            <Sensitive>{a.name}</Sensitive>
                          </Button>
                          <div className="muted">
                            <Sensitive>
                              {a.institution || tr('个人账户')}
                              {a.cardNumberMasked
                                ? ' · ' + a.cardNumberMasked
                                : ''}
                            </Sensitive>{' '}
                            · {accountLabels[a.type]}
                          </div>
                          <Space size={4} wrap>
                            <Tag>{statusLabel(a.status)}</Tag>
                            {a.isPinned && <Tag>{tr('置顶')}</Tag>}
                            {(a.isDefaultIncome || a.isDefaultExpense) && (
                              <Tag>{tr('默认账户')}</Tag>
                            )}
                          </Space>
                        </div>
                        <div className="account-manager-row-balance">
                          <div className="account-balance-value">
                            <Money value={b.value} currency={a.currency} />
                          </div>
                          <span
                            className={b.warning ? 'account-warning' : 'muted'}
                          >
                            {tr(b.label)} · {a.currency}
                          </span>
                          {a.status === 'Active' &&
                            accountNature(a) === 'asset' &&
                            !['Receivable', 'Investment'].includes(a.type) &&
                            a.availableBalance !== undefined && (
                              <div className="muted">
                                {tr('可用')}{' '}
                                <Money
                                  value={a.availableBalance}
                                  currency={a.currency}
                                />
                              </div>
                            )}
                        </div>
                        <div className="account-manager-row-actions">
                          {orderButtons(a)}
                          <AccountActions account={a} onEdit={onEdit} />
                        </div>
                      </article>
                    );
                  })}
                </div>
              ),
          }))}
        />
      )}
    </div>
  );
}
