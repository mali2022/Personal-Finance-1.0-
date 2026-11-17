import { Button, Card, Descriptions, Space, Tag, Typography } from 'antd';
import type { Vehicle } from './api';
import { energyLabels } from './VehicleProfileFields';
export default function VehicleProfileCard({
  vehicle: v,
  english,
  hidden,
  busy,
  onEdit,
  onArchive,
  onHistory,
  onDelete,
}: {
  vehicle: Vehicle;
  english: boolean;
  hidden: boolean;
  busy: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onHistory: () => void;
  onDelete: () => void;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const show = (value: unknown) => (hidden ? '••••' : String(value ?? '—'));
  return (
    <Card
      size="small"
      title={show(v.name)}
      extra={
        <Tag>
          {v.status === 'Archived'
            ? tr('已归档', 'Archived')
            : tr('使用中', 'Active')}
        </Tag>
      }
    >
      <Typography.Paragraph>
        {show(
          [v.brand, v.model, v.modelYear, v.plate]
            .filter(Boolean)
            .join(' · ') || null,
        )}
      </Typography.Paragraph>
      <Descriptions
        column={1}
        size="small"
        items={[
          {
            key: 'fuel',
            label: tr('原燃料类型', 'Fuel type'),
            children: energyLabels[v.fuelType]?.[english ? 1 : 0] ?? v.fuelType,
          },
          {
            key: 'energy',
            label: tr('能源类型', 'Energy type'),
            children:
              energyLabels[v.energyType ?? 'Unknown']?.[english ? 1 : 0] ??
              tr('未知', 'Unknown'),
          },
          {
            key: 'tank',
            label: tr('油箱容量 L', 'Tank capacity L'),
            children: show(v.tankCapacity),
          },
          {
            key: 'engine',
            label: tr('发动机', 'Engine'),
            children: show(v.engine),
          },
          {
            key: 'initial',
            label: tr('初始里程 km', 'Initial odometer km'),
            children: show(v.initialOdometer),
          },
          {
            key: 'manual',
            label: tr('手填当前里程 km', 'Manual current odometer km'),
            children: show(v.currentOdometer),
          },
          {
            key: 'latest',
            label: tr('最新加油记录里程 km', 'Latest recorded odometer km'),
            children: show(v.latestRecordedOdometer),
          },
          {
            key: 'annual',
            label: tr('预计年里程 km', 'Expected annual distance km'),
            children: show(v.annualDistance),
          },
          {
            key: 'date',
            label: tr('购置日期', 'Purchase date'),
            children: show(v.purchaseDate),
          },
          {
            key: 'purchase',
            label: tr(
              '原始购置金额（档案）',
              'Original purchase amount (profile)',
            ),
            children: hidden
              ? '••••'
              : v.purchaseAmount == null
                ? '—'
                : `${v.purchaseAmount} ${v.purchaseCurrency ?? ''}`,
          },
          { key: 'note', label: tr('备注', 'Notes'), children: show(v.note) },
        ]}
      />
      <Space wrap style={{ marginTop: 12 }}>
        <Button disabled={busy} onClick={onEdit}>
          {tr('编辑车辆', 'Edit vehicle')}
        </Button>
        <Button disabled={busy} onClick={onArchive}>
          {v.status === 'Archived'
            ? tr('恢复车辆', 'Restore vehicle')
            : tr('归档车辆', 'Archive vehicle')}
        </Button>
        <Button onClick={onHistory}>{tr('查看记录', 'View records')}</Button>
        <Button disabled={busy} danger onClick={onDelete}>
          {tr('删除车辆', 'Delete vehicle')}
        </Button>
      </Space>
    </Card>
  );
}
