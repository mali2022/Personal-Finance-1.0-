import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Modal,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import { fuelBulkApi } from './bulk';
import type { FuelBulkRequest } from './bulk';
import type { FuelRow } from './api';
export default function FuelBulkActions({
  rows,
  english,
  disabled,
  onDone,
  onClear,
  restore = false,
  hidden = false,
}: {
  rows: FuelRow[];
  english: boolean;
  disabled: boolean;
  onDone: () => Promise<unknown>;
  onClear: () => void;
  restore?: boolean;
  hidden?: boolean;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const { message } = App.useApp();
  const [status, setStatus] = useState('Unknown');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<{
    request: FuelBulkRequest;
    rows: FuelRow[];
    key: string;
  }>();
  function prepare(action: FuelBulkRequest['action']) {
    setConfirmed(false);
    setError(undefined);
    setPending({
      request: {
        action,
        targets: rows.map((r) => ({ id: r.id, version: r.version })),
        ...(action === 'SetTankStatus' ? { tankStatus: status } : {}),
      },
      rows: [...rows],
      key: crypto.randomUUID(),
    });
  }
  async function apply() {
    if (!pending) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await fuelBulkApi.apply(
        { ...pending.request, fullTankConfirmed: confirmed },
        pending.key,
      );
      setPending(undefined);
      onClear();
      void message.success(
        tr(`已处理 ${result.count} 条记录`, `Updated ${result.count} records`),
      );
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  const needsConfirmation =
    pending?.request.action === 'SetTankStatus' &&
    pending.request.tankStatus === 'Full';
  if (hidden) return null;
  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Typography.Text>
          {tr(
            `已选 ${rows.length} 条（最多200条）`,
            `Selected ${rows.length} (maximum 200)`,
          )}
        </Typography.Text>
        <Button disabled={disabled || !rows.length} onClick={onClear}>
          {tr('清除选择', 'Clear selection')}
        </Button>
        {restore ? (
          <Button
            disabled={disabled || !rows.length}
            onClick={() => prepare('Restore')}
          >
            {tr('批量恢复', 'Restore selected')}
          </Button>
        ) : (
          <>
            <Select
              aria-label={tr('批量加满状态', 'Bulk tank status')}
              value={status}
              onChange={setStatus}
              disabled={disabled}
              options={[
                { value: 'Unknown', label: tr('未知', 'Unknown') },
                { value: 'Full', label: tr('确认加满', 'Confirmed full') },
                { value: 'Partial', label: tr('未加满', 'Partial') },
              ]}
            />
            <Button
              disabled={disabled || !rows.length}
              onClick={() => prepare('SetTankStatus')}
            >
              {tr('批量修改状态', 'Update selected tank states')}
            </Button>
            <Button
              danger
              disabled={disabled || !rows.length}
              onClick={() => prepare('Delete')}
            >
              {tr('批量移入回收站', 'Move selected to trash')}
            </Button>
          </>
        )}
      </Space>
      <Modal
        title={tr('确认批量操作与影响范围', 'Review bulk action and scope')}
        width={850}
        open={!!pending}
        onCancel={() => {
          if (!busy) setPending(undefined);
        }}
        maskClosable={!busy}
        closable={!busy}
        onOk={() => void apply()}
        confirmLoading={busy}
        okText={tr('确认处理', 'Confirm action')}
        okButtonProps={{
          disabled: needsConfirmation && !confirmed,
          danger: pending?.request.action === 'Delete',
        }}
        cancelButtonProps={{ disabled: busy }}
      >
        <Typography.Paragraph strong>
          {tr('执行动作：', 'Action: ')}
          {pending?.request.action === 'Delete'
            ? tr('移入回收站', 'Move to trash')
            : pending?.request.action === 'Restore'
              ? tr('恢复原记录', 'Restore original records')
              : tr('修改加满状态', 'Change tank state')}
        </Typography.Paragraph>
        <Alert
          type="warning"
          message={tr(
            `将处理 ${pending?.rows.length ?? 0} 条明确选择的记录，不含未选择记录。`,
            `This action affects only the ${pending?.rows.length ?? 0} explicitly selected records.`,
          )}
          description={tr(
            '状态修改、删除和恢复都会重新计算受影响油耗。删除仅进入回收站，可恢复；不删除财务流水。请核实误录或重复后再删除，移除真实加油会使油耗缺少事件。任意记录版本或状态变化时整批拒绝。恢复若与现有里程冲突也会整批拒绝。请求结果不明时请保留此窗口重试。',
            'Changes, deletion and restoration recalculate consumption. Deletion is recoverable and does not delete ledger transactions. Verify that fills are incorrect or duplicates; removing real fills makes consumption history incomplete. Any version/state conflict rejects the entire batch; restoration also checks odometer conflicts. Keep this dialog and retry if the request outcome is uncertain.',
          )}
        />
        {pending?.request.action === 'SetTankStatus' && (
          <Typography.Paragraph>
            {tr('目标加满状态：', 'Target tank state: ')}
            {pending.request.tankStatus}
          </Typography.Paragraph>
        )}
        {needsConfirmation && (
          <Checkbox
            checked={confirmed}
            disabled={busy}
            onChange={(e) => setConfirmed(e.target.checked)}
          >
            {tr(
              '我已逐条核实所选记录确实加满',
              'I have verified that every selected fill was full',
            )}
          </Checkbox>
        )}
        {error && (
          <Alert
            type="error"
            message={error}
            action={
              <Button
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    setBusy(true);
                    try {
                      await onDone();
                      setPending(undefined);
                      onClear();
                      setError(undefined);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    } finally {
                      setBusy(false);
                    }
                  })()
                }
              >
                {tr('刷新后重新选择', 'Refresh and reselect')}
              </Button>
            }
          />
        )}
        <Table<FuelRow>
          rowKey="id"
          size="small"
          dataSource={pending?.rows ?? []}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 650 }}
          columns={[
            { title: tr('记录ID', 'Record ID'), dataIndex: 'id' },
            { title: tr('日期', 'Date'), dataIndex: 'date' },
            { title: tr('加油站', 'Station'), dataIndex: 'station' },
            { title: 'L', dataIndex: 'litres' },
            {
              title: tr('原币金额', 'Original amount'),
              render: (_, r) => `${r.amount} ${r.currency}`,
            },
            { title: tr('版本', 'Version'), dataIndex: 'version' },
          ]}
        />
      </Modal>
    </>
  );
}
