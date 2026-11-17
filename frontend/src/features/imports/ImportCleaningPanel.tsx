import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Collapse,
  Drawer,
  InputNumber,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { Sensitive } from '../../components/Sensitive';
import { ErrorState } from '../../components/Feedback';
import { saveBlob } from '../../utils/download';
import { formatDate } from '../../utils/finance';
import type { ImportJob, ImportRow } from '../../types';
import { importCleaningApi, type CleaningEvent } from './api412';

export function ImportCleaningPanel({
  job,
  rows,
  changed,
}: {
  job: ImportJob;
  rows: ImportRow[];
  changed: (job: ImportJob) => void;
}) {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const { message } = App.useApp();
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [rowIndex, setRowIndex] = useState<number>();
  const [detail, setDetail] = useState<CleaningEvent>();
  const [consent, setConsent] = useState(false);
  const history = useQuery({
    queryKey: ['import-cleaning', job.id, job.version, page, rowIndex],
    queryFn: () => importCleaningApi.history(job.id, page, rowIndex),
  });
  const suggestions = useQuery({
    queryKey: ['import-suggestions', job.id, job.version],
    queryFn: () => importCleaningApi.suggestions(job.id),
  });
  const apply = (next: ImportJob) => {
    changed(next);
    void cache.invalidateQueries({ queryKey: ['import-cleaning', job.id] });
    void cache.invalidateQueries({ queryKey: ['import-suggestions', job.id] });
  };
  const error = (e: Error) => message.error(e.message);
  const normalize = useMutation({
    mutationFn: () => importCleaningApi.normalize(job.id, job.version),
    onSuccess: apply,
    onError: error,
  });
  const recognize = useMutation({
    mutationFn: () =>
      importCleaningApi.recognize(
        job.id,
        job.version,
        rows
          .filter(
            (r) =>
              (r.status === 'Ready' || r.status === 'Invalid') &&
              (r.type === 'Income' || r.type === 'Expense'),
          )
          .slice(0, 20)
          .map((r) => r.id),
      ),
    onSuccess: apply,
    onError: error,
    retry: false,
  });
  const decide = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      importCleaningApi.decide(job.id, id, accept, job.version),
    onSuccess: apply,
    onError: error,
  });
  const undo = useMutation({
    mutationFn: (id: string) => importCleaningApi.undo(job.id, id, job.version),
    onSuccess: apply,
    onError: error,
  });
  const download = useMutation({
    mutationFn: () => importCleaningApi.export(job.id),
    onSuccess: (data) =>
      saveBlob(
        new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json;charset=utf-8',
        }),
        `import-trace-${job.id}.json`,
      ),
    onError: error,
  });
  const sourceFile = useMutation({
    mutationFn: () => importCleaningApi.source(job.id),
    onSuccess: (blob) => saveBlob(blob, job.fileName),
    onError: error,
  });
  const busy =
    normalize.isPending ||
    recognize.isPending ||
    decide.isPending ||
    undo.isPending;
  const eligible = rows.some(
    (r) =>
      (r.status === 'Ready' || r.status === 'Invalid') &&
      (r.type === 'Income' || r.type === 'Expense'),
  );
  return (
    <Card
      className="mb16"
      title={t('数据清洗与识别', 'Data cleaning & recognition')}
    >
      <Alert
        showIcon
        type="info"
        message={t(
          '原始数据保留，清洗只修改导入预览；确认导入后才影响账本。',
          'Original data is retained. Cleaning edits the preview; only confirmed imports affect the ledger.',
        )}
        description={
          <Space wrap>
            <span>
              {t('编码', 'Encoding')}:{' '}
              {history.data?.sourceEncoding || t('历史任务', 'Legacy job')}
            </span>
            <span>
              {t('原文件表头行', 'Header line')}:{' '}
              {history.data?.headerRow || '—'}
            </span>
            <Typography.Text
              copyable={
                history.data?.sourceHash
                  ? { text: history.data.sourceHash }
                  : false
              }
            >
              {t('文件指纹', 'File hash')}:{' '}
              {history.data?.sourceHash?.slice(0, 16) ||
                t('旧任务未采集', 'Unavailable for legacy jobs')}
            </Typography.Text>
            <Link to="/merchants">
              {t('管理商户主数据与别名', 'Manage merchant names & aliases')}
            </Link>
          </Space>
        }
      />
      {job.state === 'Preview' && (
        <Space direction="vertical" style={{ width: '100%', marginTop: 12 }}>
          <Space wrap>
            <Button
              disabled={busy}
              loading={normalize.isPending}
              onClick={() => normalize.mutate()}
            >
              {t('按商户主数据重新匹配', 'Refresh merchant matching')}
            </Button>
            <Checkbox
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            >
              {t(
                '已核对当前页商户文字，同意发送至 DeepSeek 辅助识别',
                'I reviewed the merchant text on this page and agree to send it to DeepSeek',
              )}
            </Checkbox>
            <Button
              disabled={!consent || !eligible || busy}
              loading={recognize.isPending}
              onClick={() => recognize.mutate()}
            >
              {t(
                'AI 识别当前页（最多20行）',
                'AI suggestions for this page (up to 20)',
              )}
            </Button>
          </Space>
          <Typography.Text type="secondary">
            {t(
              '需已开启AI及识别文字授权。仅发送商户文字、交易类型及有限商户/分类候选，不传金额、时间、账号、备注或原文件。建议逐条采纳，不自动新增商户或入账；模型自评不代表已核实。',
              'Enable AI and recognition-text consent first. Only merchant text, transaction type and bounded merchant/category candidates are sent; amounts, dates, accounts, notes and source files are excluded. Review suggestions individually; no merchants or transactions are created automatically. Confidence is the model’s estimate.',
            )}
          </Typography.Text>
          <Link to="/settings/ai">
            {t('AI设置与识别授权', 'AI settings & recognition consent')}
          </Link>
        </Space>
      )}
      {suggestions.isError && (
        <ErrorState
          error={suggestions.error}
          retry={() => void suggestions.refetch()}
        />
      )}
      {!!suggestions.data?.items.length && (
        <Table
          size="small"
          rowKey="id"
          style={{ marginTop: 16 }}
          dataSource={suggestions.data.items}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 760 }}
          columns={[
            { title: t('行', 'Row'), dataIndex: 'index' },
            {
              title: t('商户建议', 'Merchant'),
              render: (_, r) => <Sensitive>{r.merchant || '—'}</Sensitive>,
            },
            { title: t('分类建议', 'Category'), dataIndex: 'category' },
            {
              title: t('模型自评', 'Model estimate'),
              render: (_, r) => `${Math.round(r.confidence * 100)}%`,
            },
            {
              title: t('依据', 'Reason'),
              render: (_, r) => <Sensitive>{r.reason}</Sensitive>,
            },
            {
              title: t('操作', 'Actions'),
              render: (_, r) =>
                job.state === 'Preview' ? (
                  <Space>
                    {r.stale && (
                      <Tag color="orange">{t('已过期', 'Stale')}</Tag>
                    )}
                    <Button
                      disabled={busy || r.stale}
                      onClick={() => decide.mutate({ id: r.id, accept: true })}
                    >
                      {t('采纳', 'Accept')}
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => decide.mutate({ id: r.id, accept: false })}
                    >
                      {t('忽略', 'Dismiss')}
                    </Button>
                  </Space>
                ) : (
                  '—'
                ),
            },
          ]}
        />
      )}
      <Collapse
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'history',
            label: t(
              `清洗履历（${history.data?.total || 0}步）`,
              `Cleaning history (${history.data?.total || 0} steps)`,
            ),
            children: (
              <>
                <Space wrap style={{ marginBottom: 12 }}>
                  <Button
                    disabled={!job.sourceHash}
                    loading={sourceFile.isPending}
                    onClick={() => sourceFile.mutate()}
                  >
                    {t('下载原始账单', 'Download original file')}
                  </Button>
                  <InputNumber
                    aria-label={t(
                      '按来源记录行号筛选',
                      'Filter by record number',
                    )}
                    min={1}
                    value={rowIndex}
                    placeholder={t('记录行号', 'Record number')}
                    onChange={(v) => {
                      setRowIndex(v ?? undefined);
                      setPage(1);
                    }}
                  />
                  <Button
                    loading={download.isPending}
                    onClick={() => download.mutate()}
                  >
                    {t(
                      '导出原始数据与清洗履历 JSON',
                      'Export original data & trace JSON',
                    )}
                  </Button>
                </Space>
                {history.isError ? (
                  <ErrorState
                    error={history.error}
                    retry={() => void history.refetch()}
                  />
                ) : (
                  <Table<CleaningEvent>
                    size="small"
                    rowKey="id"
                    loading={history.isPending}
                    dataSource={history.data?.items}
                    pagination={{
                      current: page,
                      pageSize: 10,
                      total: history.data?.total,
                      onChange: setPage,
                      showSizeChanger: false,
                    }}
                    scroll={{ x: 680 }}
                    columns={[
                      { title: t('记录行号', 'Record'), dataIndex: 'rowIndex' },
                      {
                        title: t('步骤', 'Step'),
                        render: (_, r) =>
                          ({
                            Mapped: t('规则清洗', 'Rule cleaning'),
                            ManualEdit: t('人工修改', 'Manual edit'),
                            AiAccepted: t('采纳AI建议', 'AI accepted'),
                            Undo: t('撤销修改', 'Undo'),
                            MerchantRefresh: t(
                              '商户重新匹配',
                              'Merchant refresh',
                            ),
                          })[r.action] || r.action,
                      },
                      { title: t('来源', 'Source'), dataIndex: 'source' },
                      {
                        title: t('规则版本', 'Rule version'),
                        dataIndex: 'ruleVersion',
                      },
                      {
                        title: t('时间', 'Time'),
                        render: (_, r) => formatDate(r.createdAt, true),
                      },
                      {
                        title: t('操作', 'Actions'),
                        render: (_, r) => (
                          <Space>
                            <Button onClick={() => setDetail(r)}>
                              {t('查看前后值', 'Before / after')}
                            </Button>
                            {job.state === 'Preview' &&
                              ['ManualEdit', 'AiAccepted', 'Undo'].includes(
                                r.action,
                              ) && (
                                <Popconfirm
                                  title={t(
                                    '撤销此行最后一次修改？',
                                    'Undo the latest change to this row?',
                                  )}
                                  onConfirm={() => undo.mutateAsync(r.id)}
                                >
                                  <Button disabled={busy}>
                                    {t('撤销', 'Undo')}
                                  </Button>
                                </Popconfirm>
                              )}
                          </Space>
                        ),
                      },
                    ]}
                  />
                )}
              </>
            ),
          },
        ]}
      />
      <Drawer
        open={!!detail}
        onClose={() => setDetail(undefined)}
        width={700}
        title={t('清洗前后值与依据', 'Cleaning evidence')}
      >
        <Sensitive>
          <p>{detail?.reason}</p>
        </Sensitive>
        <p>
          {t('任务版本', 'Job revision')}: {detail?.jobVersion} ·{' '}
          {t('规则', 'Rule')}: {detail?.ruleVersion}
        </p>
        <Sensitive>
          <h4>{t('清洗前（原始值）', 'Before')}</h4>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {JSON.stringify(detail?.before, null, 2)}
          </pre>
          <h4>{t('清洗后', 'After')}</h4>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {JSON.stringify(detail?.after, null, 2)}
          </pre>
        </Sensitive>
      </Drawer>
    </Card>
  );
}
