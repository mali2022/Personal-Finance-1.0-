import { t as tr, useLocale } from '../../i18n';
import { useState, type CSSProperties } from 'react';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Drawer,
  Form,
  Input,
  Space,
  Table,
  theme,
} from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { Select } from '../../components/TouchSelect';
import { AccountSelector, CategorySelector } from '../../components/Selectors';
import { DirectorySelector } from '../../components/BusinessSelectors';
import { batchApi } from '../../api/batch';
import type { BatchChanges, BatchPreview, BatchRequest } from '../../api/batch';
import { useUI } from '../../stores/ui';
import { ErrorState } from '../../components/Feedback';
import { isApiError } from '../../utils/errors';
export function BatchDrawer({
  items,
  onClose,
  onCompleted,
}: {
  items: { id: string; version: string }[];
  onClose: () => void;
  onCompleted: () => void;
}) {
  useLocale();
  const [batchItems] = useState(items);
  const [changes, setChanges] = useState<BatchChanges>({});
  const [preview, setPreview] = useState<BatchPreview>();
  const [prepared, setPrepared] = useState<{
    body: BatchRequest;
    key: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [batchId, setBatchId] = useState<string>();
  const [failedBatchId, setFailedBatchId] = useState<string>();
  const hidden = useUI((s) => s.hidden);
  const { token } = theme.useToken();
  const client = useQueryClient();
  const { message } = App.useApp();
  function update(patch: Partial<BatchChanges>) {
    setChanges((c) => ({ ...c, ...patch }));
    setPreview(undefined);
    setPrepared(undefined);
    setBatchId(undefined);
    setFailedBatchId(undefined);
    setError(undefined);
  }
  async function inspect() {
    setBusy(true);
    setError(undefined);
    try {
      const body = { items: batchItems, changes };
      setPreview(await batchApi.preview(body));
      setPrepared({ body, key: crypto.randomUUID() });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!prepared) return;
    setBusy(true);
    setError(undefined);
    setFailedBatchId(undefined);
    try {
      const result = await batchApi.apply(prepared.body, prepared.key);
      setBatchId(result.batchId);
      await client.invalidateQueries();
      onCompleted();
      message.success(tr("已更新 {0} 笔交易", result.count));
    } catch (e) {
      setError(e);
      if (isApiError(e) && e.details?.resultSaved?.[0] === 'True')
        setFailedBatchId(e.details.batchId?.[0]);
    } finally {
      setBusy(false);
    }
  }
  const display = (value: unknown) => (hidden ? '••••' : JSON.stringify(value));
  return (
    <Drawer
      title={tr("批量编辑交易")}
      open
      onClose={onClose}
      width={760}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        message={tr("已选择 {0} 笔；最多100笔，全部成功或全部回滚。执行前重新校验版本与关联。", batchItems.length)}
      />
      <Form
        layout="vertical"
        disabled={busy || !!batchId}
        style={{ marginTop: 16 }}
      >
        <Form.Item label={tr('更换账户（仅同币种普通单账户收支）')}><AccountSelector value={changes.accountId} onChange={(accountId) => update({accountId})} history /></Form.Item>
        <Form.Item label={tr('记录状态')}><Select allowClear value={changes.status} onChange={(status) => update({status})} options={[{value:'Confirmed',label:tr('已确认')},{value:'NeedsReview',label:tr('待整理')}]} /></Form.Item>
        <Form.Item label={tr("分类（不选则保持原值）")}>
          <CategorySelector
            value={changes.categoryId}
            onChange={(v) => update({ categoryId: v })}
          />
        </Form.Item>
        <Form.Item
          label={
            <Checkbox
              checked={!!changes.setMerchant}
              onChange={(e) => update({ setMerchant: e.target.checked })}
            >
              {tr("修改商户（可清空）")}</Checkbox>
          }
        >
          <Input
            aria-label={tr("批量商户")}
            value={changes.merchant}
            maxLength={200}
            disabled={!changes.setMerchant}
            onChange={(e) => update({ merchant: e.target.value })}
          />
        </Form.Item>
        <Form.Item label={tr("添加标签")}>
          <DirectorySelector
            kind="tags"
            multiple
            value={changes.addTagIds}
            onChange={(v) => update({ addTagIds: v as string[] })}
          />
        </Form.Item>
        <Form.Item label={tr("移除标签")}>
          <DirectorySelector
            kind="tags"
            multiple
            history
            value={changes.removeTagIds}
            onChange={(v) => update({ removeTagIds: v as string[] })}
          />
        </Form.Item>
        <Form.Item
          label={
            <Checkbox
              checked={!!changes.setProject}
              onChange={(e) => update({ setProject: e.target.checked })}
            >
              {tr("设置项目（可清空）")}</Checkbox>
          }
        >
          <DirectorySelector
            kind="projects"
            value={changes.projectId || undefined}
            onChange={(v) =>
              update({ projectId: typeof v === 'string' ? v : null })
            }
          />
        </Form.Item>
        <Form.Item
          label={
            <Checkbox
              checked={!!changes.setNote}
              onChange={(e) => update({ setNote: e.target.checked })}
            >
              {tr("修改备注（可清空，受保护原因除外）")}</Checkbox>
          }
        >
          <Input.TextArea
            aria-label={tr("批量备注")}
            value={changes.note}
            maxLength={2000}
            disabled={!changes.setNote}
            onChange={(e) => update({ note: e.target.value })}
          />
        </Form.Item>
      </Form>
      <Space wrap>
        <Button onClick={inspect} loading={busy} disabled={!!batchId}>
          {tr("预览修改")}</Button>
        <Button
          aria-label={tr("执行整批")}
          type="primary"
          onClick={apply}
          loading={busy}
          disabled={!preview || preview.rejected > 0 || !!batchId}
        >
          {tr("执行整批")}</Button>
      </Space>
      {error != null && <ErrorState error={error} />}
      {failedBatchId && (
        <Alert
          type="error"
          message={tr("失败批量编号：{0}；交易修改已回滚", failedBatchId)}
          action={
            <Button
              onClick={async () => {
                try {
                  const result = await batchApi.result(failedBatchId);
                  message.info(tr("执行失败，已修改 {0} 笔", result.count));
                } catch (e) {
                  setError(e);
                }
              }}
            >
              {tr("查看失败结果")}</Button>
          }
        />
      )}
      {preview && (
        <>
          <Alert
            className="mb16"
            type={preview.rejected ? 'warning' : 'success'}
            message={tr("选中 {0}，允许 {1}，拒绝 {2}", preview.selected, preview.allowed, preview.rejected)}
            description={tr("预算 / 报表月份：{0}", preview.affected.months.join('、'))}
          />
          <Table
            className="batch-preview-table"
            style={
              {
                '--batch-header-background': token.colorBgContainer,
                '--batch-header-color': token.colorTextSecondary,
              } as CSSProperties
            }
            rowKey="id"
            size="small"
            dataSource={preview.items}
            scroll={{ x: 600 }}
            columns={[
              {
                title: tr("交易 / 版本"),
                render: (_, r) =>
                  `${r.id}（选中 v${r.requestedVersion} / 当前 v${r.version || '—'} / 执行后 v${r.nextVersion || '—'}）`,
              },
              { title: tr("拒绝原因"), dataIndex: 'reason' },
              { title: tr("修改前"), render: (_, r) => display(r.before) },
              { title: tr("修改后"), render: (_, r) => display(r.after) },
            ]}
          />
        </>
      )}
      {batchId && (
        <Alert
          type="success"
          message={tr("批量操作编号：{0}", batchId)}
          action={
            <Button
              onClick={async () => {
                try {
                  const result = await batchApi.result(batchId);
                  message.info(tr("{0}，{1} 笔", result.state, result.count));
                } catch (e) {
                  setError(e);
                }
              }}
            >
              {tr("查看结果")}</Button>
          }
        />
      )}
    </Drawer>
  );
}
