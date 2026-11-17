import { t as tr, useLocale } from '../../i18n';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  ArrowRightOutlined,
  WalletOutlined,
  RiseOutlined,
  FallOutlined,
  BankOutlined,
} from '@ant-design/icons';
import { Button, Card } from 'antd';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { Money } from '../../components/Money';
import { decimal, minor } from '../../utils/finance';
import type { DashboardDto } from '../../types';
import { useUI } from '../../stores/ui';

export function FinancialSummary({ data: d }: { data: DashboardDto }) {
  useLocale();
  const navigate = useNavigate();
  const hidden = useUI((s) => s.hidden);
  const currentMonth = d.month === dayjs().format('YYYY-MM');
  const metrics = [
    {
      label: currentMonth ? tr('本月收入') : tr('收入'),
      value: d.income,
      previous: d.previousIncome,
      icon: <ArrowDownOutlined />,
      tone: 'income',
    },
    {
      label: currentMonth ? tr('本月净支出') : tr('净支出'),
      value: d.expense,
      previous: d.previousExpense,
      icon: <ArrowUpOutlined />,
      tone: 'expense',
    },
    {
      label: currentMonth ? tr('本月结余') : tr('结余'),
      value: d.surplus,
      icon: <WalletOutlined />,
      tone: 'surplus',
    },
  ];
  return (
    <section className="overview-metrics" aria-label={tr('财务概览')}>
      <Card className="networth-card">
        <div className="metric-topline">
          <span className="stat-label">{tr('当前净资产')}</span>
          <BankOutlined aria-hidden />
        </div>
        <div className="networth-value">
          <Money currency={d.currency || 'CNY'} value={d.netWorth} />
        </div>
        <div className="networth-breakdown">
          <div>
            <span>{tr('总资产')}</span>
            <Money currency={d.currency || 'CNY'} value={d.assets} />
          </div>
          <div>
            <span>{tr('总负债')}</span>
            <Money currency={d.currency || 'CNY'} value={d.liabilities} />
          </div>
        </div>
        <div className="networth-footer">
          <Button
            type="text"
            size="small"
            onClick={() => navigate('/accounts')}
            aria-label={tr('查看账户')}
            icon={<ArrowRightOutlined />}
          />
        </div>
      </Card>
      {metrics.map((metric) => {
        const delta =
          metric.previous === undefined
            ? undefined
            : minor(metric.value) - minor(metric.previous);
        return (
          <Card
            className={`overview-metric metric-${metric.tone}`}
            key={metric.tone}
          >
            <div className="metric-topline">
              <span className="stat-label">{metric.label}</span>
              <span className="metric-icon" aria-hidden>
                {metric.icon}
              </span>
            </div>
            <div className="overview-metric-value">
              <Money currency={d.currency || 'CNY'} value={metric.value} />
            </div>
            <div className="metric-comparison">
              {delta !== undefined ? (
                <>
                  {!hidden && (
                    <span className="comparison-icon" aria-hidden>
                      {delta > 0n ? (
                        <RiseOutlined />
                      ) : delta < 0n ? (
                        <FallOutlined />
                      ) : (
                        <ArrowRightOutlined />
                      )}
                    </span>
                  )}
                  <span>{tr('较上月变化')}</span>
                  <Money currency={d.currency || 'CNY'} value={decimal(delta)} />
                </>
              ) : (
                <>
                  <span className="comparison-dot" />
                  <span>
                    {currentMonth ? tr('本月收入') : tr('收入')} −{' '}
                    {currentMonth ? tr('本月净支出') : tr('净支出')}
                  </span>
                </>
              )}
            </div>
          </Card>
        );
      })}
    </section>
  );
}
