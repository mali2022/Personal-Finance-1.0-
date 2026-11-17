import { t as tr, useLocale } from '../../i18n';
import { useUI } from '../../stores/ui';
import { Card, Button, Progress, theme } from 'antd';
import dayjs from 'dayjs';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { decimal, minor } from '../../utils/finance';
import { Money } from '../../components/Money';
import type { Budget } from '../../types';

export function BudgetProgress({
  budget,
  month = budget.month,
}: {
  budget: Budget;
  month?: string;
}) {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const configured = minor(budget.total) > 0n;
  const ratio = configured
    ? Math.max(0, (Number(budget.used) / Number(budget.total)) * 100)
    : 0;
  const over = ratio > 100;
  const warning = ratio > 80;
  const status = hidden
    ? tr('金额已隐藏')
    : !configured
      ? tr('待设置')
      : over
        ? tr('已超预算')
        : ratio === 100
          ? tr('预算已用完')
          : warning
            ? tr('接近预算')
            : tr('执行良好');
  return (
    <Card
      title={
        <div className="dashboard-panel-heading">
          <strong>
            {month === dayjs().format('YYYY-MM')
              ? tr('本月预算')
              : `${month} · ${tr('预算')}`}
          </strong>
        </div>
      }
      className="dashboard-panel dashboard-budget-panel"
      extra={
        <Button type="link" onClick={() => navigate('/budgets')}>
          {tr('管理')}
          <ArrowRightOutlined />
        </Button>
      }
    >
      <div className="dashboard-budget-topline">
        <span>{tr('已使用')}</span>
        <span
          className={`dashboard-budget-status ${!hidden && configured ? (over ? 'is-over' : warning ? 'is-warning' : 'is-healthy') : ''}`}
        >
          {hidden ? (
            <EyeInvisibleOutlined />
          ) : configured ? (
            warning ? (
              <ExclamationCircleOutlined />
            ) : (
              <CheckCircleOutlined />
            )
          ) : null}
          {status}
        </span>
      </div>
      <div className="dashboard-budget-amount">
        <Money value={budget.used} />
        <span>
          / <Money value={budget.total} />
        </span>
      </div>
      {!hidden ? (
        <div className="dashboard-budget-progress">
          <Progress
            percent={Math.min(100, Math.round(ratio))}
            showInfo={false}
            strokeColor={
              over
                ? token.colorError
                : warning
                  ? token.colorWarning
                  : token.colorPrimary
            }
            trailColor={token.colorFillSecondary}
            strokeWidth={8}
          />
          <span>{configured ? `${Math.round(ratio)}%` : '—'}</span>
        </div>
      ) : (
        <div className="dashboard-budget-hidden-line" aria-hidden="true" />
      )}
      <div className="dashboard-budget-bottomline">
        <span>{over && !hidden ? tr('超出预算') : tr('剩余预算')}</span>
        <strong>
          {configured ? (
            <Money
              value={decimal(
                over && !hidden
                  ? minor(budget.used) - minor(budget.total)
                  : minor(budget.total) - minor(budget.used),
              )}
            />
          ) : (
            tr('未设置')
          )}
        </strong>
      </div>
      {!configured && !hidden ? (
        <Button
          block
          className="dashboard-budget-create"
          onClick={() => navigate('/budgets')}
        >
          {month === dayjs().format('YYYY-MM')
            ? tr('设置本月预算')
            : tr('创建预算')}
          <ArrowRightOutlined />
        </Button>
      ) : hidden ? (
        <p className="dashboard-budget-caption">{tr('预算执行已隐藏')}</p>
      ) : null}
    </Card>
  );
}
