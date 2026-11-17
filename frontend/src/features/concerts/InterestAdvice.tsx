import { useState } from 'react';
import { App, Button, Modal, Space } from 'antd';
import { apiClient } from '../../api/client';
import type { ApiResponse } from '../../types';
import type { PurchaseRecord } from './interestApi';
export function InterestAdvice({ record }: { record: PurchaseRecord }) {
  const { modal, message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string>();
  return (
    <Space>
      <Button
        loading={busy}
        onClick={() =>
          modal.confirm({
            title: '确认使用已有 AI 服务分析？',
            content:
              '将发送这笔购买资料、音乐兴趣年度消费摘要和已授权财务资料。建议会留存审计，不会创建扣款或自动关联专题。',
            onOk: async () => {
              setBusy(true);
              try {
                const r = await apiClient.post<ApiResponse<{ text: string }>>(
                  `/concerts/interests/purchases/${record.id}/advice`,
                  { confirmTransmission: true },
                  {
                    headers: {
                      'If-Match': record.version,
                      'Idempotency-Key': crypto.randomUUID(),
                    },
                  },
                );
                setText(r.data.data.text);
              } catch (e) {
                message.error((e as Error).message || '操作失败，请重试');
              } finally {
                setBusy(false);
              }
            },
          })
        }
      >
        AI 关联 / 趋势 / 计划价值建议
      </Button>
      <Modal
        open={text !== undefined}
        title="AI 建议（需人工确认）"
        footer={null}
        onCancel={() => setText(undefined)}
      >
        <div style={{ whiteSpace: 'pre-wrap' }}>{text}</div>
      </Modal>
    </Space>
  );
}
