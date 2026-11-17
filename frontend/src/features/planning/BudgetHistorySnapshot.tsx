import { localizedLabels } from '../../i18n';
import { t as tr, useLocale } from '../../i18n';
import { Money } from '../../components/Money';
import { planningLabel } from '../../utils/planningLabels';
export default function BudgetHistorySnapshot({
  value,
  categoryName,
}: {
  value: string;
  categoryName: (id: string) => string;
}) {
  useLocale();
  const data = JSON.parse(value) as {
    total?: string;
    amount?: string;
    sourceMonth?: string;
    targetMonth?: string;
    state?: string;
    rule?: string;
    parameter?: string;
    cap?: string;
    items?: { categoryId: string; limit: string }[];
    allocations?: { month: number; categoryId?: string; amount: string }[];
  };
  const rules: Record<string, string> = localizedLabels({
    None: '不结转',
    Full: '全额',
    Fixed: '固定金额',
    Percent: '比例',
  });
  return (
    <div>
      {data.total != null && (
        <p>
          {tr("总额度")}<Money value={data.total} />
        </p>
      )}
      {data.amount != null && (
        <p>
          {data.sourceMonth} → {data.targetMonth} {tr("· 结转")}{' '}
          <Money value={data.amount} /> · {rules[data.rule || ''] || tr("规则")}
          {data.rule === 'Percent' ? (
            ` ${data.parameter}%`
          ) : data.rule === 'Fixed' ? (
            <Money value={data.parameter || '0.00'} />
          ) : (
            ''
          )}
          {data.cap != null && (
            <>
              {' '}
              {tr("· 上限")}<Money value={data.cap} />
            </>
          )}
        </p>
      )}
      {data.state && <p>{tr("状态：")}{planningLabel(data.state)}</p>}
      {data.items?.map((item) => (
        <p key={item.categoryId}>
          {categoryName(item.categoryId)} · <Money value={item.limit} />
        </p>
      ))}
      {data.allocations?.map((a) => (
        <p key={`${a.month}:${a.categoryId}`}>
          {a.month === 0 ? tr("全年分类") : tr("{0}月", a.month)} ·{' '}
          {a.categoryId ? categoryName(a.categoryId) : tr("总额度")}{' '}
          <Money value={a.amount} />
        </p>
      ))}
    </div>
  );
}
