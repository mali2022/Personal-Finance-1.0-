import { anomalyLabels, anomalyExplanations } from './anomalyRules';
import { DatePicker } from '../../components/ResponsiveDatePicker';
import { Select } from '../../components/TouchSelect';
import { localizedLabels } from '../../i18n';
import { t as tr, useLocale } from '../../i18n';
import { useRef, useState } from 'react';
import { Alert, App, Button, Drawer, Input, Space, Timeline } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { batchApi } from '../../api/batch';
import { ErrorState } from '../../components/Feedback';
import { formatDate } from '../../utils/finance';
import { useUI } from '../../stores/ui';
const stateLabels: Record<string, string> = localizedLabels({
  Open: '待处理',
  Resolved: '已处理',
  Ignored: '已忽略',
  Deferred: '已延后',
});
const labels: Record<string, string> = localizedLabels({
  Open: '重新打开',
  Resolved: '人工处理完成',
  Ignored: '忽略',
  Deferred: '延后处理',
});
export function ReviewDrawer({
  id,
  onClose,
  onEdit,
}: {
  id: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  useLocale();
  const q = useQuery({
    queryKey: ['transaction-review', id],
    queryFn: () => batchApi.review(id),
  });
  const client = useQueryClient();
  const { message } = App.useApp();
  const hidden = useUI((s) => s.hidden);
  const submission = useRef<{ signature: string; key: string } | undefined>(
    undefined,
  );
  const [state, setState] = useState('Resolved');
  const [note, setNote] = useState('');
  const [until, setUntil] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  return (
    <Drawer title={tr("待整理问题处理")} open onClose={onClose} width={560}>
      {q.isError && <ErrorState error={q.error} retry={() => q.refetch()} />}
      {q.data && (
        <>
          <Alert
            message={tr("问题状态：{0}；版本 {1}", stateLabels[q.data.state], q.data.version)}
            description={q.data.reasons.map(code=>tr(anomalyExplanations[code] || anomalyLabels[code] || code)).join('；') || tr("历史问题记录")}
          />
          <p>
            {tr("问题处理独立于交易状态。人工处理前可进入交易详情修正分类或其他信息。")}</p>
          <Button onClick={onEdit}>{tr("编辑交易")}</Button>
          <Select
            aria-label={tr("问题处理动作")}
            value={state}
            onChange={setState}
            options={Object.entries(labels).map(([value, label]) => ({
              value,
              label,
            }))}
            style={{ width: '100%', marginTop: 16 }}
          />
          {state === 'Deferred' && (
            <DatePicker showTime onChange={(v) => setUntil(v?.toISOString())} />
          )}
          <Input.TextArea
            aria-label={tr("处理说明")}
            placeholder={tr("填写处理说明")}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ margin: '16px 0' }}
          />
          <Space>
            <Button
              type="primary"
              loading={busy}
              disabled={!note.trim() || (state === 'Deferred' && !until)}
              onClick={async () => {
                setBusy(true);
                setError(undefined);
                try {
                  const signature = JSON.stringify({
                    id,
                    version: q.data.version,
                    state,
                    note,
                    until,
                  });
                  if (submission.current?.signature !== signature)
                    submission.current = {
                      signature,
                      key: crypto.randomUUID(),
                    };
                  await batchApi.reviewUpdate(
                    id,
                    q.data.version,
                    { state, note, deferredUntil: until },
                    submission.current.key,
                  );
                  await client.invalidateQueries();
                  message.success(tr("问题状态已更新"));
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {tr("保存处理")}</Button>
          </Space>
          {error != null && <ErrorState error={error} />}
          <p>{tr("当前处理说明：")}{hidden ? '••••' : q.data.note || '—'}</p>
          <h3>{tr("处理历史")}</h3>
          <Timeline
            items={q.data.history.map((h) => ({
              children: (
                <>
                  <span>{formatDate(h.createdAt, true)}</span>
                  <p>
                    {hidden
                      ? '••••'
                      : h.changes
                          .map((c) =>
                            c.field === 'State'
                              ? `问题状态：${stateLabels[c.before || ''] || '待处理'} → ${stateLabels[c.after || ''] || '待处理'}`
                              : c.field === 'Note'
                                ? '处理说明已保存（审计内容脱敏）'
                                : c.field === 'DeferredUntil'
                                  ? `延后至：${c.after ? formatDate(c.after, true) : '已取消延后'}`
                                  : '',
                          )
                          .filter(Boolean)
                          .join('；')}
                  </p>
                </>
              ),
            }))}
          />
        </>
      )}
    </Drawer>
  );
}
