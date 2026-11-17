import { t as tr, useLocale } from '../i18n';
import { useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Drawer,
  Empty,
  List,
  Space,
} from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient, type OperationResult } from '../api/client';
import type { ApiResponse } from '../types';
import {
  completeOperation,
  journalEvent,
  pendingOperations,
  type PendingOperation,
} from '../stores/operationJournal';
import { formatDate } from '../utils/finance';

export function OperationRecovery({ userId }: { userId?: string }) {
  useLocale();
  const [items, setItems] = useState<PendingOperation[]>([]);
  const [storageError, setStorageError] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string>();
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  useEffect(() => {
    const update = () => {
      try {
        setItems(userId ? pendingOperations(userId) : []);
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
    };
    update();
    window.addEventListener(journalEvent, update);
    return () => window.removeEventListener(journalEvent, update);
  }, [userId]);
  const check = async (item: PendingOperation, retry = false) => {
    if (!userId || busy) return;
    setBusy(item.key);
    try {
      const { data } = await apiClient.get<ApiResponse<OperationResult>>(
        `/operations/${encodeURIComponent(item.key)}`,
        { params: { fingerprint: item.fingerprint } },
      );
      if (data.data.state === 'Completed') {
        completeOperation(userId, item.key);
        await cache.invalidateQueries({
          predicate: (query) => query.queryKey[0] !== 'session',
        });
        message.success(tr("已确认保存成功，没有重复记账。"));
      } else if (retry) {
        await apiClient.request({
          method: item.method,
          url: item.path,
          data: item.body,
          headers: {
            'Idempotency-Key': item.key,
            ...(item.version ? { 'If-Match': item.version } : {}),
          },
        });
        await cache.invalidateQueries({
          predicate: (query) => query.queryKey[0] !== 'session',
        });
        message.success(tr("原请求已处理。"));
      } else
        message.info(
          tr("尚未查到已完成结果，也可能仍在处理中。需要重试时请使用原请求。"),
        );
    } catch (error: unknown) {
      message.error(
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : tr("查询失败，请稍后重试。"),
      );
    } finally {
      setBusy(undefined);
    }
  };
  if (storageError)
    return (
      <Alert
        type="error"
        showIcon
        message={tr("无法读取提交记录，请先核实最近的交易结果，避免重复记账。")}
      />
    );
  if (!items.length) return null;
  return (
    <>
      <Alert
        className="mb16"
        type="warning"
        showIcon
        message={tr("有 {0} 笔提交记录待核实", items.length)}
        action={
          <Button size="small" onClick={() => setOpen(true)}>
            {tr("查看提交记录")}</Button>
        }
      />
      <Drawer
        title={tr("核实提交结果")}
        open={open}
        onClose={() => setOpen(false)}
        width={520}
      >
        <List
          locale={{ emptyText: <Empty description={tr("没有待核实提交")} /> }}
          dataSource={items}
          renderItem={(item) => (
            <List.Item>
              <Space direction="vertical">
                <span>
                  {formatDate(item.createdAt, true, true)} ·{' '}
                  {item.path.startsWith('/transactions')
                    ? tr("交易提交")
                    : tr("业务提交")}
                </span>
                <Space wrap>
                  <Button
                    disabled={!!busy}
                    loading={busy === item.key}
                    onClick={() => void check(item)}
                  >
                    {tr("查询结果")}</Button>
                  <Button
                    disabled={!!busy}
                    onClick={() =>
                      modal.confirm({
                        title: tr("使用原请求核实并重试？"),
                        content:
                          tr("内容和请求编号保持不变；后端已完成的请求不会再次过账。"),
                        onOk: () => check(item, true),
                      })
                    }
                  >
                    {tr("确认重试原请求")}</Button>
                </Space>
              </Space>
            </List.Item>
          )}
        />
      </Drawer>
    </>
  );
}
