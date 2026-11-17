import { DatePicker } from '../../components/ResponsiveDatePicker';
import { Select } from '../../components/TouchSelect';
import { t as tr, useLocale } from '../../i18n';
import { useRef, useState } from 'react';
import { App, Button, Card, Checkbox, Space } from 'antd';
import dayjs from 'dayjs';
import { useMutation } from '@tanstack/react-query';
import { advancedApi } from '../../api/operations';
import { AccountSelector, CategorySelector } from '../../components/Selectors';
import { transactionLabels } from '../../constants/mappings';
import { saveBlob } from '../../utils/download';
import type {
  ApiError,
  TransactionFilters,
  TransactionType,
} from '../../types';
export function ExportPanel() {
  useLocale();
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);
  const [all, setAll] = useState(false);
  const [account, setAccount] = useState<string>();
  const [category, setCategory] = useState<string>();
  const [type, setType] = useState<TransactionType>();
  const [count, setCount] = useState<number>();
  const { message } = App.useApp();
  const attempt = useRef({ fingerprint: '', key: crypto.randomUUID() });
  const mutation = useMutation({
    mutationFn: async (format: 'CSV' | 'Excel') => {
      const filters: Partial<TransactionFilters> = {
        accountId: account,
        categoryId: category,
        type,
        ...(!all
          ? {
              start: range[0].startOf('day').toISOString(),
              end: range[1].endOf('day').toISOString(),
            }
          : {}),
      };
      const fingerprint = JSON.stringify({ format, filters });
      if (attempt.current.fingerprint !== fingerprint)
        attempt.current = { fingerprint, key: crypto.randomUUID() };
      const job = await advancedApi.export(
        format,
        filters,
        attempt.current.key,
      );
      const blob = await advancedApi.download(job.id);
      saveBlob(blob, job.fileName);
      return job;
    },
    onSuccess: (job) => {
      attempt.current = { fingerprint: '', key: crypto.randomUUID() };
      setCount(job.count);
      message.success(tr("已导出 {0} 笔交易", job.count));
    },
    onError: (e: ApiError) => {
      message.error(e.message);
    },
  });
  return (
    <Card className="mt20" title={tr("导出交易")}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Checkbox checked={all} onChange={(e) => setAll(e.target.checked)}>
          {tr("全部时间")}</Checkbox>
        <DatePicker.RangePicker
          disabled={all}
          allowClear={false}
          value={range}
          onChange={(v) => {
            if (v?.[0] && v[1]) setRange([v[0], v[1]]);
          }}
        />
        <Space wrap>
          <div style={{ width: 220 }}>
            <AccountSelector history value={account} onChange={setAccount} />
          </div>
          <div style={{ width: 230 }}>
            <CategorySelector history value={category} onChange={setCategory} />
          </div>
          <Select
            aria-label={tr("导出交易类型")}
            allowClear
            placeholder={tr("全部交易类型")}
            style={{ width: 170 }}
            value={type}
            onChange={setType}
            options={Object.entries(transactionLabels).map(
              ([value, label]) => ({ value, label }),
            )}
          />
          <Button
            onClick={() => {
              setAccount(undefined);
              setCategory(undefined);
              setType(undefined);
            }}
          >
            {tr("清除条件")}</Button>
        </Space>
        <Space>
          <Button
            disabled={mutation.isPending}
            loading={mutation.isPending}
            onClick={() => mutation.mutate('CSV')}
          >
            {tr("导出 CSV")}</Button>
          <Button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate('Excel')}
          >
            {tr("导出 Excel")}</Button>
        </Space>
        {count !== undefined && <span>{tr("上次导出")}{count} {tr("笔")}</span>}
      </Space>
    </Card>
  );
}
