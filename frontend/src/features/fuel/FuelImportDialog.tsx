import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Input,
  Modal,
  Space,
  Table,
  Typography,
} from 'antd';
import type { Vehicle } from './api';
import { fuelImportApi, parseFuelCsv } from './import';
import type { FuelCsvRow, FuelImportPlan, FuelImportRecord } from './import';

export default function FuelImportDialog({
  open,
  onClose,
  onImported,
  vehicles,
  english,
  hidden,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => Promise<unknown>;
  vehicles: Vehicle[];
  english: boolean;
  hidden: boolean;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const { message } = App.useApp();
  const [text, setText] = useState('');
  const [rows, setRows] = useState<FuelCsvRow[]>([]);
  const [batch, setBatch] = useState<{
    records: FuelImportRecord[];
    plan: FuelImportPlan;
    key: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const change = (value: string) => {
    setText(value);
    setRows([]);
    setBatch(undefined);
    setError(undefined);
  };
  async function preview() {
    setError(undefined);
    setBatch(undefined);
    setBusy(true);
    try {
      const parsed = parseFuelCsv(text, vehicles);
      setRows(parsed);
      if (parsed.some((r) => r.errors.length)) return;
      const records = parsed.map((r) => r.input!);
      const plan = await fuelImportApi.preview(records);
      setBatch({ records, plan, key: crypto.randomUUID() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!batch) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await fuelImportApi.confirm(batch.records, batch.key);
      // Clear the committed batch before cache refresh so a refresh failure never invites another import.
      setText('');
      setRows([]);
      setBatch(undefined);
      void message.success(
        tr(
          `已导入 ${result.imported} 条，跳过疑似重复 ${result.skippedDuplicates} 条`,
          `Imported ${result.imported}; skipped ${result.skippedDuplicates} possible duplicates`,
        ),
      );
      await onImported();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function read(file: File) {
    setBatch(undefined);
    setRows([]);
    setError(undefined);
    if (file.size > 1024 * 1024) {
      setError(tr('文件最大1MB', 'Maximum file size is 1MB'));
      return;
    }
    setBusy(true);
    try {
      change(await file.text());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={tr('导入历史加油 CSV', 'Import historical fuel CSV')}
      width={1000}
      open={open && !hidden}
      onCancel={() => {
        if (!busy) onClose();
      }}
      maskClosable={!busy}
      closable={!busy}
      footer={
        <Space wrap>
          <Button disabled={busy} onClick={onClose}>
            {tr('关闭（不导入）', 'Close without importing')}
          </Button>
          <Button
            loading={busy}
            disabled={!text.trim() || busy}
            onClick={() => void preview()}
          >
            {tr('解析并预览', 'Parse and preview')}
          </Button>
          <Button
            type="primary"
            loading={busy}
            disabled={
              busy || !batch || batch.plan.errors > 0 || batch.plan.ready === 0
            }
            onClick={() => void confirm()}
          >
            {tr(
              '确认导入有效行并跳过重复',
              'Confirm valid rows; skip duplicates',
            )}
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        {tr('已有车辆ID：', 'Existing vehicle IDs: ')}
        {vehicles.map((v) => `${v.name}: ${v.id}`).join(' · ')}
      </Typography.Paragraph>
      <Input
        type="file"
        accept=".csv,text/csv"
        aria-label={tr('选择加油CSV文件', 'Choose fuel CSV file')}
        disabled={busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void read(file);
          event.target.value = '';
        }}
      />
      <Input.TextArea
        aria-label={tr('加油CSV内容', 'Fuel CSV content')}
        placeholder="Date,Vehicle ID,Litres,Amount,Currency,Full tank"
        value={text}
        maxLength={1024 * 1024}
        rows={5}
        disabled={busy}
        onChange={(event) => change(event.target.value)}
        style={{ margin: '12px 0' }}
      />
      {error && <Alert type="error" message={error} />}
      {batch && (
        <Alert
          type={batch.plan.errors ? 'error' : 'warning'}
          message={tr(
            `可导入 ${batch.plan.ready}，疑似重复 ${batch.plan.duplicates}，错误 ${batch.plan.errors}`,
            `Ready ${batch.plan.ready}; duplicates ${batch.plan.duplicates}; errors ${batch.plan.errors}`,
          )}
        />
      )}
      <Table<FuelCsvRow>
        size="small"
        rowKey="row"
        dataSource={rows}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 900 }}
        columns={[
          { title: tr('记录行', 'Record row'), dataIndex: 'row' },
          {
            title: tr('车辆ID / 日期', 'Vehicle ID / date'),
            render: (_, r) =>
              `${r.input?.vehicleId ?? '—'} / ${r.input?.date ?? '—'}`,
          },
          {
            title: tr('油量 / 实付', 'Litres / paid'),
            render: (_, r) =>
              `${r.input?.litres ?? '—'} L / ${r.input?.amount ?? '—'} ${r.input?.currency ?? ''}`,
          },
          {
            title: tr('加满状态', 'Tank state'),
            render: (_, r) => r.input?.tankStatus,
          },
          {
            title: tr('校验 / 说明', 'Validation / notes'),
            render: (_, r) => {
              const server = batch?.plan.rows.find((x) => x.row === r.row);
              return (
                [
                  r.errors.join('; '),
                  r.warnings.join('; '),
                  server?.status,
                  server?.reason,
                  server?.duplicateIds.join(', '),
                ]
                  .filter(Boolean)
                  .join(' · ') || tr('待服务端预览', 'Awaiting server preview')
              );
            },
          },
        ]}
      />
    </Modal>
  );
}
