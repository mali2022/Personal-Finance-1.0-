import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRightOutlined } from '@ant-design/icons';
import {
  AppleCard,
  AppleChart,
  AppleEmpty,
} from '../../../components/apple';
import { ErrorState } from '../../../components/Feedback';
import { Money } from '../../../components/Money';
import { accountLabels } from '../../../constants/mappings';
import { t as tr } from '../../../i18n';
import type { AccountType, CategoryStat, Currency } from '../../../types';
import { decimal, minor } from '../../../utils/finance';
import { categoryApi } from '../../../api/finance';
import {
  formatPercent,
  structureFromAccounts,
  useAllocation,
  useDashboardSummary,
} from '../../overview';
import { categoryDonutOption } from './charts';
import {
  Bar,
  DashboardModule,
  Metric,
  ModuleNote,
  PrivacyState,
} from './moduleFrame';

interface Slice {
  key: string;
  label: string;
  amount: string;
  percent: number | null;
}

function allocationSlices(
  items: readonly { type: string; amount: string; percent: string | null }[],
  total: string,
): Slice[] {
  const whole = minor(total);
  return items
    .filter((item) => minor(item.amount) > 0n)
    .map((item) => ({
      key: item.type,
      label: accountLabels[item.type as AccountType] ?? item.type,
      amount: item.amount,
      percent:
        item.percent !== null
          ? Number(item.percent)
          : whole > 0n
            ? Number((minor(item.amount) * 10000n) / whole) / 100
            : null,
    }));
}

/** Module 3 — assets / liabilities split from the ledger + allocation snapshot. */
export function StructureModule({
  month,
  currency,
  privacy,
}: {
  month: string;
  currency: Currency;
  privacy: boolean;
}) {
  const navigate = useNavigate();
  const summary = useDashboardSummary(month);
  const allocation = useAllocation(currency);
  const accounts = summary.data?.accounts ?? [];
  const structure = structureFromAccounts(accounts, currency);
  const group = allocation.data?.groups?.[0];
  // Prefer the account ledger for both totals and slices so the two sources can
  // never mix into a double-counted figure. Allocation is only a fallback when
  // the ledger has no account structure (and for the coverage warning).
  const hasLedgerStructure =
    structure.assets.length > 0 || structure.liabilities.length > 0;
  const assetsTotal = hasLedgerStructure
    ? structure.assetTotal
    : (group?.assets ?? structure.assetTotal);
  const liabilitiesTotal = hasLedgerStructure
    ? structure.liabilityTotal
    : (group?.liabilities ?? structure.liabilityTotal);
  const netWorth = decimal(minor(assetsTotal) - minor(liabilitiesTotal));
  const assets: Slice[] = hasLedgerStructure
    ? structure.assets
    : group
      ? allocationSlices(group.allocation, group.assets)
      : [];
  const liabilities: Slice[] = hasLedgerStructure
    ? structure.liabilities
    : [];
  const empty =
    assets.length === 0 &&
    liabilities.length === 0 &&
    minor(assetsTotal) === 0n &&
    minor(liabilitiesTotal) === 0n;
  const incomplete =
    allocation.data && (!allocation.data.complete || allocation.data.uncovered > 0);
  const loading =
    (summary.isPending || allocation.isPending) &&
    !summary.data &&
    !allocation.data;
  return (
    <DashboardModule id="structure" span={4}>
      <AppleCard
        title={tr('资产与负债结构')}
        action={
          <Link className="pf-link" to="/assets/allocation">
            {tr('资产配置')}
            <ArrowRightOutlined aria-hidden="true" />
          </Link>
        }
        loading={!privacy && loading}
        footer={
          structure.excludedCurrencies.length > 0 ? (
            <ModuleNote>
              {tr(
                '未纳入本币结构的外币账户：{0}。',
                structure.excludedCurrencies.join(' / '),
              )}
            </ModuleNote>
          ) : undefined
        }
      >
        {privacy ? (
          <PrivacyState label={tr('资产与负债结构')} />
        ) : empty && allocation.isError && summary.isError ? (
          <ErrorState
            error={allocation.error ?? summary.error}
            retry={() => {
              void allocation.refetch();
              void summary.refetch();
            }}
          />
        ) : empty ? (
          <AppleEmpty
            title={tr('暂无资产与负债结构')}
            description={tr('添加账户并记录余额后，这里会显示资产、负债与净资产构成。')}
            action={
              <Link className="pf-link" to="/accounts">
                {tr('管理账户')}
              </Link>
            }
          />
        ) : (
          <>
            <div className="dash-metric-row is-compact">
              <Metric
                label={tr('资产合计')}
                value={assetsTotal}
                currency={currency}
                tone="positive"
              />
              <Metric
                label={tr('负债合计')}
                value={liabilitiesTotal}
                currency={currency}
                tone="negative"
              />
              <Metric label={tr('净资产')} value={netWorth} currency={currency} />
            </div>
            <div className="dash-structure">
              <button
                type="button"
                className="dash-structure-head"
                onClick={() => navigate('/accounts')}
              >
                <span>{tr('资产构成')}</span>
                <span className="dash-structure-total">
                  <Money value={assetsTotal} currency={currency} />
                </span>
              </button>
              <div className="dash-slices">
                {assets.slice(0, 5).map((slice) => (
                  <div className="dash-slice" key={slice.key}>
                    <span className="dash-slice-label">{slice.label}</span>
                    <span className="dash-slice-value">
                      <Money value={slice.amount} currency={currency} />
                      <span className="pf-faint">
                        {formatPercent(slice.percent)}
                      </span>
                    </span>
                    <Bar percent={slice.percent} tone="tint" />
                  </div>
                ))}
                {assets.length === 0 ? (
                  <p className="dash-note">{tr('暂无正余额资产账户。')}</p>
                ) : null}
              </div>
              <div className="pf-divider" />
              <button
                type="button"
                className="dash-structure-head"
                onClick={() => navigate('/accounts')}
              >
                <span>{tr('负债构成')}</span>
                <span className="dash-structure-total">
                  <Money value={liabilitiesTotal} currency={currency} />
                </span>
              </button>
              <div className="dash-slices">
                {liabilities.slice(0, 5).map((slice) => (
                  <div className="dash-slice" key={slice.key}>
                    <span className="dash-slice-label">{slice.label}</span>
                    <span className="dash-slice-value">
                      <Money value={slice.amount} currency={currency} />
                      <span className="pf-faint">
                        {formatPercent(slice.percent)}
                      </span>
                    </span>
                    <Bar percent={slice.percent} tone="negative" />
                  </div>
                ))}
                {liabilities.length === 0 ? (
                  <p className="dash-note">{tr('暂无负债账户。')}</p>
                ) : null}
              </div>
            </div>
            {incomplete ? (
              <p className="dash-warning">
                {tr(
                  '资产估值未完全覆盖：{0} 个账户缺少估值或汇率，净资产可能被低估。',
                  allocation.data?.uncovered ?? 0,
                )}
              </p>
            ) : null}
            {allocation.isError ? (
              <p className="dash-note">
                {tr('资产覆盖接口暂不可用，当前仅显示账户账本结构。')}{' '}
                <button
                  type="button"
                  className="pf-link"
                  onClick={() => void allocation.refetch()}
                >
                  {tr('重试')}
                </button>
              </p>
            ) : null}
          </>
        )}
      </AppleCard>
    </DashboardModule>
  );
}

/** Module 4 — current-month expense category distribution with drill-down. */
export function CategoriesModule({
  month,
  currency,
  privacy,
}: {
  month: string;
  currency: Currency;
  privacy: boolean;
}) {
  const navigate = useNavigate();
  const summary = useDashboardSummary(month);
  const categories = [...(summary.data?.categories ?? [])]
    .filter((category) => minor(category.amount) > 0n)
    .sort((a, b) => {
      const left = minor(a.amount);
      const right = minor(b.amount);
      return left === right ? 0 : left > right ? -1 : 1;
    });
  const top = categories.slice(0, 6);
  const rest = categories.slice(6);
  const otherAmount = rest.reduce((sum, category) => sum + minor(category.amount), 0n);
  const chartItems: CategoryStat[] =
    rest.length > 0
      ? [
          ...top,
          {
            categoryId: '',
            name: tr('其他'),
            amount: decimal(otherAmount),
            share: rest.reduce((sum, category) => sum + category.share, 0),
          },
        ]
      : top;
  const drillDown = (categoryId: string) => {
    if (!categoryId) return;
    navigate(
      `/transactions?categoryId=${encodeURIComponent(categoryId)}&month=${month}`,
    );
  };
  return (
    <DashboardModule id="categories" span={4}>
      <AppleCard
        title={tr('消费分类分布')}
        action={
          <Link className="pf-link" to={`/transactions?month=${month}`}>
            {tr('交易明细')}
            <ArrowRightOutlined aria-hidden="true" />
          </Link>
        }
        loading={!privacy && summary.isPending}
      >
        {privacy ? (
          <PrivacyState label={tr('消费分类')} />
        ) : summary.isError ? (
          <ErrorState error={summary.error} retry={() => summary.refetch()} />
        ) : categories.length === 0 ? (
          <AppleEmpty
            title={tr('本月暂无分类支出')}
            description={tr('所选账期没有已分类的支出记录。')}
          />
        ) : (
          <>
            <div className="dash-donut-grid">
              <div className="dash-donut">
                <AppleChart
                  option={categoryDonutOption(chartItems, currency)}
                  height={188}
                  ariaLabel={tr('当月支出分类环形图，悬停可读取金额与占比')}
                  onClick={(name) => {
                    const item = chartItems.find((entry) => entry.name === name);
                    if (item) drillDown(item.categoryId);
                  }}
                />
              </div>
              <div className="dash-rank">
                {categories.slice(0, 5).map((category) => (
                  <button
                    type="button"
                    className="dash-rank-row"
                    key={category.categoryId}
                    onClick={() => drillDown(category.categoryId)}
                  >
                    <span className="dash-rank-main">
                      <span className="dash-rank-name">{category.name}</span>
                      <span className="dash-rank-share">
                        {formatPercent(category.share)}
                      </span>
                    </span>
                    <span className="dash-rank-amount">
                      <Money value={category.amount} currency={currency} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="dash-metric-row is-compact">
              <Metric
                label={tr('支出合计')}
                value={summary.data?.expense}
                currency={currency}
                tone="negative"
              />
              <Metric
                label={tr('支出分类')}
                text={tr('{0} 个', categories.length)}
                currency={currency}
              />
            </div>
          </>
        )}
      </AppleCard>
    </DashboardModule>
  );
}

/** Module 5 — monthly budget execution with per-category progress. */
export function BudgetModule({
  month,
  currency,
  privacy,
}: {
  month: string;
  currency: Currency;
  privacy: boolean;
}) {
  const summary = useDashboardSummary(month);
  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: categoryApi.list,
    staleTime: 300_000,
  });
  const names = new Map(
    (categoriesQuery.data ?? []).map((category) => [category.id, category.name]),
  );
  const budget = summary.data?.budget;
  const total = budget ? minor(budget.total) : 0n;
  const used = budget ? minor(budget.used) : 0n;
  const remaining = total - used;
  const percent =
    total > 0n ? Number((used * 10000n) / total) / 100 : null;
  const items = (budget?.items ?? [])
    .map((item) => {
      const limit = minor(item.limit);
      const spent = minor(item.used);
      return {
        id: item.id,
        categoryId: item.categoryId,
        name: names.get(item.categoryId) ?? tr('未命名分类'),
        limit,
        spent,
        percent:
          limit > 0n ? Number((spent * 10000n) / limit) / 100 : null,
      };
    })
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1))
    .slice(0, 5);
  const noBudget = !budget || total <= 0n;
  return (
    <DashboardModule id="budget" span={4}>
      <AppleCard
        title={tr('预算执行情况')}
        action={
          <Link className="pf-link" to="/budgets">
            {tr('管理预算')}
            <ArrowRightOutlined aria-hidden="true" />
          </Link>
        }
        loading={!privacy && summary.isPending}
      >
        {privacy ? (
          <PrivacyState label={tr('预算执行')} />
        ) : summary.isError ? (
          <ErrorState error={summary.error} retry={() => summary.refetch()} />
        ) : noBudget ? (
          <AppleEmpty
            title={tr('本月尚未设置预算')}
            description={tr('设置月度总预算与分类预算后，这里会显示执行进度。')}
            action={
              <Link className="pf-link" to="/budgets">
                {tr('设置预算')}
              </Link>
            }
          />
        ) : (
          <>
            <div className="dash-budget-head">
              <span className="dash-budget-percent">
                {formatPercent(percent)}
              </span>
              <span className="dash-budget-used">
                <Money value={budget.used} currency={currency} />
                <span className="pf-faint"> / </span>
                <Money value={budget.total} currency={currency} />
              </span>
            </div>
            <Bar
              percent={percent}
              tone={
                percent !== null && percent > 100 ? 'negative' : 'tint'
              }
            />
            <div className="dash-metric-row is-compact">
              <Metric label={tr('预算总额')} value={budget.total} currency={currency} />
              <Metric label={tr('已用')} value={budget.used} currency={currency} />
              <Metric
                label={tr('剩余')}
                value={decimal(remaining < 0n ? 0n : remaining)}
                currency={currency}
              />
            </div>
            {items.length > 0 ? (
              <div className="dash-slices">
                {items.map((item) => (
                  <div className="dash-slice" key={item.id}>
                    <span className="dash-slice-label">{item.name}</span>
                    <span className="dash-slice-value">
                      <Money value={decimal(item.spent)} currency={currency} />
                      <span className="pf-faint">
                        / {formatPercent(item.percent)}
                      </span>
                    </span>
                    <Bar
                      percent={item.percent}
                      tone={
                        item.percent !== null && item.percent > 100
                          ? 'negative'
                          : 'positive'
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="dash-note">{tr('本月仅设置了总预算，尚无分类预算。')}</p>
            )}
            {remaining < 0n ? (
              <p className="dash-warning">
                {tr('已超出预算 {0}。', decimal(-remaining))}
              </p>
            ) : null}
          </>
        )}
      </AppleCard>
    </DashboardModule>
  );
}
