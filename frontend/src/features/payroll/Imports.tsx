import { useCurrencyState } from '../../hooks/useCurrency';
import { CURRENCY_CODES } from '../../constants/currencies';
import { recognizePayrollImage } from './ocr';
import { useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Image,
  Input,
  Progress,
  Space,
  Steps,
  Table,
  Tag,
  Upload,
} from 'antd';
import { Select } from '../../components/TouchSelect';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorState } from '../../components/Feedback';
import { saveBlob } from '../../utils/download';
import { useUI } from '../../stores/ui';
import { payrollApi, value, type Row, type ImportJob } from './api';
import { usePayrollCatalog } from './catalog';
import { usePayText } from './text';
const mappingFields: [string, string, string][] = [
  ['month', '工资归属月', 'Earning month'],
  ['payDate', '发薪日期', 'Pay date'],
  ['gross', '应发', 'Gross'],
  ['base', '基本工资', 'Base pay'],
  ['bonus', '年终奖', 'Annual bonus'],
  ['allowance', '补贴', 'Allowance'],
  ['performance', '绩效', 'Performance'],
  ['otherEarnings', '其他应发', 'Other earnings'],
  ['pension', '养老', 'Pension'],
  ['medical', '医疗', 'Medical'],
  ['unemployment', '失业', 'Unemployment'],
  ['housing', '公积金', 'Housing fund'],
  ['tax', '个税', 'Income tax'],
  ['otherDeductions', '其他扣款', 'Other deductions'],
  ['net', '实发', 'Net'],
];
const aliases: Record<string, string[]> = {
  month: ['月份', '工资月份', '归属月', 'month'],
  payDate: ['发薪日期', '日期', 'paydate'],
  gross: ['应发', '应发工资', 'gross'],
  base: ['基本工资', 'base'],
  bonus: ['奖金', '年终奖', 'bonus'],
  allowance: ['补贴', 'allowance'],
  pension: ['养老', '养老保险', 'pension'],
  medical: ['医疗', '医疗保险', 'medical'],
  unemployment: ['失业', 'unemployment'],
  housing: ['公积金', 'housing'],
  tax: ['个税', '个人所得税', 'tax'],
  otherDeductions: ['其他扣款', 'otherdeductions'],
  net: ['实发', '实发工资', 'net'],
};
export function PayrollImports() {
  const t = usePayText();
  const { message } = App.useApp();
  const hidden = useUI((s) => s.hidden);
  const cache = useQueryClient();
  const catalog = usePayrollCatalog();
  const [jobId, setJobId] = useState<string>();
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [employmentId, setEmploymentId] = useState('');
  const [currency, setCurrency] = useCurrencyState();
  const [localFile, setLocalFile] = useState<File>();
  const [imageUrl, setImageUrl] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [progress, setProgress] = useState<number>();
  const [ocrError, setOcrError] = useState<unknown>();
  const jobs = useQuery({
    queryKey: ['payroll-center', 'imports'],
    queryFn: () => payrollApi.get<Row[]>('/imports'),
  });
  const job = useQuery({
    queryKey: ['payroll-center', 'import', jobId],
    queryFn: () => payrollApi.get<ImportJob>('/imports/' + jobId),
    enabled: !!jobId,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  useEffect(() => {
    if (!job.data) return;
    setRows(job.data.rows);
    const map: Record<string, string> = {};
    for (const [key, names] of Object.entries(aliases)) {
      const header = job.data.headers.find((h) =>
        names.includes(h.toLowerCase().replace(/\s/g, '')),
      );
      if (header) map[key] = header;
    }
    const old = job.data.mapping;
    setMapping((old.mapping as Record<string, string>) || map);
    if (old.employmentId) setEmploymentId(String(old.employmentId));
    if (old.currency) setCurrency(String(old.currency));
  }, [job.data, setCurrency]);
  useEffect(() => {
    if (!localFile?.type.startsWith('image/')) {
      setImageUrl('');
      return;
    }
    const url = URL.createObjectURL(localFile);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [localFile]);
  const canonicalMap = (v: Record<string, string>) =>
    JSON.stringify(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
  const dirty =
    !!job.data &&
    (JSON.stringify(rows) !== JSON.stringify(job.data.rows) ||
      employmentId !== String(job.data.mapping.employmentId || '') ||
      currency !== String(job.data.mapping.currency || 'CNY') ||
      canonicalMap(mapping) !==
        canonicalMap(
          (job.data.mapping.mapping as Record<string, string>) || {},
        ));
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['payroll-center'] });
  };
  const upload = useMutation({
    mutationFn: (file: File) => payrollApi.upload('/imports', file),
    onSuccess: (d, file) => {
      setLocalFile(file);
      setJobId(d.id);
      setOcrText('');
      refresh();
    },
  });
  const preview = useMutation({
    mutationFn: () =>
      payrollApi.write(
        '/imports/' + jobId + '/preview',
        { employmentId, currency, mapping, rows },
        job.data?.version,
      ),
    onSuccess: refresh,
  });
  const commit = useMutation({
    mutationFn: () =>
      payrollApi.write(
        '/imports/' + jobId + '/commit',
        { reason: 'User confirmed preview' },
        job.data?.version,
      ),
    onSuccess: () => {
      refresh();
      message.success(
        t(
          '工资已保存为草稿，未生成银行交易',
          'Payslips saved as drafts; no bank transactions posted',
        ),
      );
    },
  });
  const runOcr = async () => {
    setProgress(0);
    setOcrError(undefined);
    try {
      let file = localFile;
      if (!file && job.data) {
        const blob = await payrollApi.document(job.data.documentId);
        file = new File([blob], job.data.fileName, { type: blob.type });
        setLocalFile(file);
      }
      if (!file) throw { message: t('请先上传图片', 'Upload an image first') };
      const result = await recognizePayrollImage(file, setProgress);
      setOcrText(result.text);
      setProgress(undefined);
    } catch (e) {
      setOcrError(e);
      setProgress(undefined);
    }
  };
  const fillFromText = () => {
    if (!job.data) return;
    const source = ocrText.replace(
      /(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g,
      '',
    );
    const row = job.data.headers.map((header) => {
      if (header === '月份') {
        const m = source.match(/(20\d{2})[-/.年](\d{1,2})/);
        return m ? `${m[1]}-${m[2].padStart(2, '0')}` : '';
      }
      if (header === '发薪日期') {
        const m = source.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
        return m
          ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
          : '';
      }
      const keys = Object.entries(aliases).find(([, names]) =>
        names.includes(header),
      )?.[1] || [header];
      for (const key of keys) {
        const m = source.match(
          new RegExp(
            key +
              '(?:工资|金额)?\\s*[:：]?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)',
            'i',
          ),
        );
        if (m) return m[1].replace(/,/g, '');
      }
      return '';
    });
    setRows([row]);
  };
  const template = () =>
    saveBlob(
      new Blob(
        [
          '\uFEFF月份,发薪日期,应发,基本工资,奖金,补贴,养老,医疗,失业,公积金,个税,其他扣款,实发\r\n2026-10,2026-10-25,10000,9000,0,1000,800,200,50,700,97.50,0,8152.50\r\n',
        ],
        { type: 'text/csv;charset=utf-8' },
      ),
      'payroll-template.csv',
    );
  return (
    <div className="payroll-stack">
      <Card>
        <Steps
          size="small"
          current={
            !jobId
              ? 0
              : job.data?.state === 'Committed'
                ? 4
                : job.data?.state === 'Previewed'
                  ? 3
                  : 1
          }
          items={[
            t('上传', 'Upload'),
            t('解析与字段映射', 'Parse & map'),
            t('校验', 'Validate'),
            t('预览确认', 'Review'),
            t('保存草稿', 'Save drafts'),
          ].map((title) => ({ title }))}
        />
        <Space wrap style={{ marginTop: 20 }}>
          <Upload
            showUploadList={false}
            accept=".csv,.xlsx,.png,.jpg,.jpeg"
            beforeUpload={(f) => {
              upload.mutate(f);
              return false;
            }}
          >
            <Button type="primary" loading={upload.isPending}>
              {t('上传工资文件', 'Upload payslip file')}
            </Button>
          </Upload>
          <Button
            onClick={() =>
              upload.mutate(
                new File(
                  [
                    '月份,发薪日期,应发,基本工资,奖金,补贴,养老,医疗,失业,公积金,个税,其他扣款,实发\r\n',
                  ],
                  'manual-payroll.csv',
                  { type: 'text/csv' },
                ),
              )
            }
          >
            {t('批量手工录入', 'Manual batch')}
          </Button>
          <Button onClick={template}>
            {t('下载 CSV 模板', 'Download CSV template')}
          </Button>
          <Select
            allowClear
            placeholder={t('恢复历史导入', 'Resume import')}
            value={jobId}
            onChange={(v) => {
              setJobId(v);
              setLocalFile(undefined);
              setOcrText('');
            }}
            style={{ minWidth: 230 }}
            options={jobs.data?.map((x) => ({
              value: x.id,
              label: value(x, 'fileName') + ' · ' + value(x, 'state'),
            }))}
          />
        </Space>
        {upload.isError && <ErrorState error={upload.error} />}
      </Card>
      {job.isError && <ErrorState error={job.error} />}{' '}
      {job.data && (
        <>
          <Card title={job.data.fileName}>
            <div className="payroll-toolbar">
              <Select
                placeholder={t('选择工作经历', 'Choose employment')}
                value={employmentId || undefined}
                onChange={setEmploymentId}
                options={catalog.employments.data?.map((x) => ({
                  value: x.id,
                  label:
                    value(x, 'employerName') + ' · ' + value(x, 'position'),
                }))}
              />
              <Select
                value={currency}
                onChange={setCurrency}
                options={CURRENCY_CODES.map((value) => ({
                  value,
                  label: value,
                }))}
              />
              <Button
                onClick={() =>
                  void payrollApi
                    .document(job.data!.documentId)
                    .then((blob) => saveBlob(blob, job.data!.fileName))
                    .catch((e) => message.error(e.message))
                }
              >
                {t('查看源文件', 'Download source')}
              </Button>
            </div>
            {/\.(png|jpe?g)$/i.test(job.data.fileName) && (
              <div className="payroll-stack">
                {imageUrl && (
                  <Image
                    src={imageUrl}
                    className="payroll-file-preview"
                    alt={t('源工资条图片', 'Source payslip image')}
                  />
                )}
                <Button
                  disabled={hidden}
                  loading={progress !== undefined}
                  onClick={() => void runOcr()}
                >
                  {t('本地识别图片文字', 'Recognize image locally')}
                </Button>
                {progress !== undefined && <Progress percent={progress} />}
                <Input.TextArea
                  rows={6}
                  value={ocrText}
                  onChange={(e) => setOcrText(e.target.value)}
                  placeholder={t(
                    'OCR识别文本，可手动更正',
                    'OCR text; review and edit',
                  )}
                />
                <Button disabled={!ocrText} onClick={fillFromText}>
                  {t(
                    '尝试填入可识别字段（仍需逐项核对）',
                    'Fill recognized fields (review each value)',
                  )}
                </Button>
                {ocrError !== undefined && (
                  <Alert
                    type="error"
                    message={t(
                      '图片识别失败，可对照原图手动录入',
                      'OCR failed; transcribe from the original image',
                    )}
                  />
                )}
              </div>
            )}
            <Form layout="vertical" style={{ marginTop: 20 }}>
              <Space wrap align="start">
                {mappingFields.map(([key, zh, en]) => (
                  <Form.Item key={key} label={t(zh, en)}>
                    <Select
                      allowClear
                      value={mapping[key] || undefined}
                      style={{ width: 155 }}
                      options={job.data!.headers.map((h) => ({
                        value: h,
                        label: h,
                      }))}
                      onChange={(v) =>
                        setMapping((m) => ({ ...m, [key]: v || '' }))
                      }
                    />
                  </Form.Item>
                ))}
              </Space>
            </Form>
            <Alert
              type="warning"
              message={t(
                '金额、归属月和发薪日期请逐行核对。编辑下表后重新预览；有错误时整批不会保存。奖金映射指全年一次性奖金，其他奖金请映射至其他应发再更正项目分类。',
                'Review amounts and both dates row by row. Preview again after edits; a batch with errors cannot save. Bonus mapping means annual bonus; map other bonuses to Other earnings and correct their category afterward.',
              )}
              style={{ marginBottom: 16 }}
            />
            <Table
              size="small"
              rowKey="index"
              scroll={{ x: Math.max(900, job.data.headers.length * 150) }}
              pagination={{ pageSize: 10 }}
              dataSource={rows.map((row, index) => ({ index, row }))}
              columns={[
                {
                  title: '#',
                  dataIndex: 'index',
                  width: 50,
                  render: (v: number) => v + 1,
                },
                ...job.data.headers.map((h, col) => ({
                  title: h,
                  key: h,
                  width: 150,
                  render: (_: unknown, x: { index: number; row: string[] }) => (
                    <Input
                      aria-label={h + ' ' + (x.index + 1)}
                      disabled={job.data!.state === 'Committed'}
                      value={x.row[col] || ''}
                      onChange={(e) =>
                        setRows((all) =>
                          all.map((r, i) =>
                            i === x.index
                              ? job.data!.headers.map((_, c) =>
                                  c === col ? e.target.value : r[c] || '',
                                )
                              : r,
                          ),
                        )
                      }
                    />
                  ),
                })),
              ]}
            />
            <Space wrap>
              <Button
                disabled={job.data.state === 'Committed'}
                onClick={() =>
                  setRows((all) => [...all, job.data!.headers.map(() => '')])
                }
              >
                {t('添加一行', 'Add row')}
              </Button>
              <Button
                type="primary"
                loading={preview.isPending}
                disabled={!employmentId || job.data.state === 'Committed'}
                onClick={() => preview.mutate()}
              >
                {t('校验并预览', 'Validate & preview')}
              </Button>
            </Space>
            {preview.isError && <ErrorState error={preview.error} />}
          </Card>
          <Card title={t('预览与保存', 'Preview & save')}>
            {dirty && job.data.state === 'Previewed' && (
              <Alert
                style={{ marginBottom: 16 }}
                type="warning"
                message={t(
                  '内容已修改，请重新校验预览后再确认保存。',
                  'Values changed. Validate and preview again before saving.',
                )}
              />
            )}
            <Table
              rowKey="index"
              dataSource={job.data.preview || []}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 600 }}
              columns={[
                { title: t('行号', 'Row'), dataIndex: 'index' },
                {
                  title: t('归属月', 'Month'),
                  render: (_: unknown, x: ImportJob['preview'][number]) =>
                    String(x.slip?.month || '—'),
                },
                {
                  title: t('发薪日期', 'Pay date'),
                  render: (_: unknown, x: ImportJob['preview'][number]) =>
                    String(x.slip?.payDate || '—'),
                },
                {
                  title: t('校验结果', 'Validation'),
                  render: (_: unknown, x: ImportJob['preview'][number]) =>
                    x.issues.length ? (
                      <Alert type="error" message={x.issues.join('；')} />
                    ) : (
                      <Tag color="green">
                        {t('通过，待确认', 'Valid; confirm required')}
                      </Tag>
                    ),
                },
              ]}
            />
            {commit.isError && <ErrorState error={commit.error} />}
            <Button
              type="primary"
              loading={commit.isPending}
              disabled={
                dirty ||
                preview.isPending ||
                job.data.state !== 'Previewed' ||
                !job.data.preview.length ||
                job.data.preview.some((x) => x.issues.length > 0)
              }
              onClick={() => commit.mutate()}
            >
              {job.data.state === 'Committed'
                ? t('已保存草稿', 'Drafts saved')
                : t('确认保存全部草稿', 'Confirm & save all drafts')}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
