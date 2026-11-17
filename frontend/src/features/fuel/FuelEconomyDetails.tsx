import { Alert, Table } from 'antd';
import type { FuelStrategyResult } from './strategy';
export default function FuelEconomyDetails({
  result: r,
  currency,
  english,
}: {
  result: FuelStrategyResult;
  currency: string;
  english: boolean;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const e = r.economy;
  if (!e) return null;
  return (
    <>
      <Alert
        type={r.netSaving > 0 ? 'success' : 'warning'}
        message={tr(
          `预计每月节省 ${r.netSaving} ${currency}`,
          `Estimated monthly saving ${r.netSaving} ${currency}`,
        )}
        description={
          <>
            <div>
              {tr('月油费：当前 / 目标', 'Monthly fuel cost: current / target')}
              : {r.baselineCost} / {r.alternativeCost} {currency}
            </div>
            <div>
              {tr('年油费：当前 / 目标', 'Annual fuel cost: current / target')}:{' '}
              {e.annualBaselineCost} / {e.annualTargetCost} {currency}
            </div>
            <div>
              {tr('每年节省 / 周期累计节省', 'Annual saving / total saving')}:{' '}
              {e.annualSaving} / {e.totalSaving} {currency}
            </div>
          </>
        }
      />
      <Table
        rowKey="priceFactor"
        size="small"
        pagination={false}
        scroll={{ x: 550 }}
        dataSource={e.sensitivity}
        columns={[
          { title: tr('油价倍数', 'Price factor'), dataIndex: 'priceFactor' },
          { title: `${currency}/L`, dataIndex: 'fuelPrice' },
          { title: tr('月节省', 'Monthly saving'), dataIndex: 'monthlySaving' },
          { title: tr('年节省', 'Annual saving'), dataIndex: 'annualSaving' },
          { title: tr('累计节省', 'Total saving'), dataIndex: 'totalSaving' },
        ]}
      />
    </>
  );
}
