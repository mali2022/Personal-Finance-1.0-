import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Table } from 'antd';
import { fuelBulkApi } from './bulk';
import FuelBulkActions from './FuelBulkActions';
import type { FuelRow } from './api';
export default function FuelTrashPanel({
  hidden,
  english,
}: {
  hidden: boolean;
  english: boolean;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const cache = useQueryClient();
  const [selected, setSelected] = useState<FuelRow[]>([]);
  const [page, setPage] = useState(1);
  const { message } = App.useApp();
  const query = useQuery({
    queryKey: ['fuel', 'trash', page],
    queryFn: () => fuelBulkApi.trash(page),
    enabled: !hidden,
  });
  if (hidden) return null;
  return (
    <Card
      title={tr('加油记录回收站', 'Fuel record trash')}
      style={{ marginBottom: 16 }}
    >
      <Alert
        type="info"
        message={tr(
          '回收站记录不参与统计，恢复后重新计算',
          'Trashed records are excluded from reports; restoration recalculates them',
        )}
        description={tr(
          `共 ${query.data?.total ?? '—'} 条，每页50条，可跨页选择最多200条恢复。没有自动永久清除。`,
          `Total ${query.data?.total ?? '—'}; 50 per page, up to 200 selected across pages. No automatic permanent purge.`,
        )}
      />
      {query.isError && (
        <Alert
          type="error"
          message={query.error.message}
          action={
            <Button onClick={() => void query.refetch()}>
              {tr('重试', 'Retry')}
            </Button>
          }
        />
      )}
      <FuelBulkActions
        rows={selected}
        restore
        english={english}
        disabled={query.isFetching}
        onClear={() => setSelected([])}
        onDone={() => {
          setPage(1);
          return cache.invalidateQueries({ queryKey: ['fuel'] });
        }}
      />
      <Table<FuelRow>
        size="small"
        rowKey="id"
        dataSource={query.data?.records ?? []}
        loading={query.isFetching}
        pagination={{
          pageSize: 50,
          current: page,
          total: query.data?.total ?? 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
        scroll={{ x: 800 }}
        rowSelection={{
          preserveSelectedRowKeys: true,
          selectedRowKeys: selected.map((r) => r.id),
          onChange: (_, rows) => {
            if (rows.length > 200) {
              void message.warning(
                tr('最多选择200条', 'Select up to 200 records'),
              );
              return;
            }
            setSelected(rows);
          },
        }}
        columns={[
          {
            title: tr('移入时间', 'Trashed at'),
            dataIndex: 'deletedAt',
            render: (value) => value ?? '—',
          },
          { title: tr('日期', 'Date'), dataIndex: 'date' },
          { title: tr('车辆ID', 'Vehicle ID'), dataIndex: 'vehicleId' },
          { title: tr('加油站', 'Station'), dataIndex: 'station' },
          { title: 'km', dataIndex: 'odometer' },
          { title: 'L', dataIndex: 'litres' },
          {
            title: tr('金额', 'Amount'),
            render: (_, r) => `${r.amount} ${r.currency}`,
          },
        ]}
      />
    </Card>
  );
}
