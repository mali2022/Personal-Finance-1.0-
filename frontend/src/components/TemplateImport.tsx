import { useRef, useState } from 'react';
import { Alert, App, Button, Modal, Popover, Space, Table, Upload } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { accountApi, categoryApi } from '../api/finance';
import { apiClient } from '../api/client';
import { useUI } from '../stores/ui';
import {
  parseTemplate,
  resolveTemplateReferences,
  templateDefinition,
  type TemplateKind,
} from '../utils/templateImport';

type ImportRow = { body: Record<string, unknown>; key: string; status: string };
export function TemplateImport({ kind }: { kind: TemplateKind }) {
  const [rows, setRows] = useState<ImportRow[]>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const hidden = useUI((s) => s.hidden);
  const cache = useQueryClient();
  const { message } = App.useApp();
  const definition = templateDefinition(kind);
  const download = () => {
    const blob = new Blob(
      [
        '\uFEFF' +
          definition.headers.join(',') +
          '\r\n' +
          definition.example.join(',') +
          '\r\n',
      ],
      { type: 'text/csv;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${kind}-template.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  async function submit() {
    if (lock.current || !rows) return;
    lock.current = true;
    setBusy(true);
    try {
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].status !== '待导入') continue;
        try {
          await apiClient.post(definition.path, rows[i].body, {
            headers: { 'Idempotency-Key': rows[i].key },
          });
          rows[i] = { ...rows[i], status: '成功' };
        } catch (error) {
          rows[i] = {
            ...rows[i],
            status: `未确认成功：${(error as Error).message}。请先核对列表，避免重复导入。`,
          };
        }
        setRows([...rows]);
      }
      await cache.invalidateQueries();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const labels: Record<string, string> = {
    name: '名称',
    currency: '币种',
    status: '状态',
    categoryId: '默认分类（可选）',
    budget: '预算',
    startDate: '开始日期（可选）',
    endDate: '结束日期（可选）',
    type: '投资类型',
    code: '证券代码（可选）',
    market: '市场（可选）',
    accountId: '资金账户',
    unit: '单位',
    state: '资产状态',
    note: '备注（可选）',
    product: '商品名称',
    brand: '品牌（可选）',
    specification: '规格',
    quantity: '数量',
    date: '样本日期',
    amount: '金额',
    priceKind: '价格口径',
    source: '来源',
    merchant: '商户（可选）',
    kind: '借贷方向',
    counterparty: '对方姓名',
    occurredAt: '发生时间',
  };
  const guide = (
    <div style={{ maxWidth: 360 }}>
      <p>
        下载 CSV 模板后替换示例行，保存为 UTF-8 CSV。最多 200
        行，上传后预览确认。
      </p>
      <p>
        账户可填唯一名称、编号或 ID；分类可填唯一名称、完整路径或 ID。日期为
        YYYY-MM-DD；借贷时间须带时区，例如 2026-10-18T12:00:00+08:00。
      </p>
      <p>
        状态：Active 启用、Disabled 停用、Completed 项目完成；资产状态：Active /
        Archived。投资类型：Stock 股票、ETF、Fund 基金、Bond 债券、Gold
        贵金属、CashManagement 现金管理、Wealth 银行理财、Other 其他。Paid
        为到手价，Listed 为标价；Lent 为借出，Borrowed 为借入。
      </p>
      {definition.headers.map((h) => (
        <div key={h}>
          {h}：{labels[h]}
        </div>
      ))}
    </div>
  );
  return (
    <>
      <Space wrap>
        <Popover trigger="click" title="模板填写说明" content={guide}>
          <Button>填写说明</Button>
        </Popover>
        <Button onClick={download}>下载导入模板</Button>
        <Upload
          accept=".csv"
          showUploadList={false}
          disabled={hidden || busy}
          beforeUpload={async (file) => {
            try {
              if (file.size > 1024 * 1024) throw new Error('文件不能超过 1MB');
              const parsed = parseTemplate(kind, await file.text());
              const [accounts, categories] = await Promise.all([
                parsed.some((r) => r.accountId)
                  ? accountApi.list()
                  : Promise.resolve([]),
                parsed.some((r) => r.categoryId)
                  ? categoryApi.list()
                  : Promise.resolve([]),
              ]);
              setRows(
                resolveTemplateReferences(
                  kind,
                  parsed,
                  accounts,
                  categories,
                ).map((body) => ({
                  body,
                  key: crypto.randomUUID(),
                  status: '待导入',
                })),
              );
            } catch (error) {
              void message.error((error as Error).message);
            }
            return false;
          }}
        >
          <Button disabled={hidden || busy}>模板导入</Button>
        </Upload>
      </Space>
      <Modal
        title="模板导入预览"
        open={!!rows}
        width={960}
        closable={!busy}
        maskClosable={!busy}
        onCancel={() => {
          if (!busy) setRows(undefined);
        }}
        footer={
          <Space>
            <Button disabled={busy} onClick={() => setRows(undefined)}>
              关闭
            </Button>
            <Button
              type="primary"
              loading={busy}
              disabled={hidden || !rows?.some((r) => r.status === '待导入')}
              onClick={() => void submit()}
            >
              确认导入 {rows?.filter((r) => r.status === '待导入').length || 0}{' '}
              行
            </Button>
          </Space>
        }
      >
        <Alert
          type={kind === 'loans' ? 'warning' : 'info'}
          showIcon
          className="mb16"
          message={
            kind === 'loans'
              ? '确认后逐行登记借贷并影响资金账户余额；Lent 为借出，Borrowed 为借入。'
              : '确认后逐行新增记录；请先删除模板示例，核对是否已存在。投资资产只登记资料，商品价格不产生支出。'
          }
          description="使用 UTF-8 CSV，最多 200 行。保留英文表头；accountId 填已有账户的唯一名称、编号或 ID；categoryId 填唯一分类名称、完整路径或 ID，投资账户的币种须与 currency 一致。status：Active 启用、Disabled 停用（项目另支持 Completed 已完成）；state：Active 启用、Archived 归档；价格口径 Paid 到手价、Listed 标价。失败或结果不明确的行请先核对列表，再另行处理。"
        />
        <Table
          rowKey="key"
          size="small"
          scroll={{ x: 1000 }}
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '结果', dataIndex: 'status', width: 220 },
            ...definition.headers.map((h) => ({
              title: labels[h] || h,
              render: (_: unknown, r: ImportRow) => String(r.body[h] ?? ''),
            })),
          ]}
        />
      </Modal>
    </>
  );
}
