import { Alert, Button, Card, Collapse, Empty, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { AiAnswer, AiSource } from '../../api/ai';
import type { AiFinding } from './types';
import { AiMarkdown } from './AiMarkdown';
import { AiEvidenceCards } from '../AiEvidenceCards';
import { Money } from '../Money';
import Chart from '../Chart';
import { useUI } from '../../stores/ui';
import { useLocale } from '../../i18n';
import type { Currency } from '../../types';
import { CURRENCY_CODES } from '../../constants/currencies';

export function AiAnalysisView({ result, onFollowUp }: { result: AiAnswer; onFollowUp?: (prompt: string) => void }) {
  const hidden = useUI(s => s.hidden);
  const locale = useLocale();
  const en = locale === 'en';
  const [openEvidence, setOpenEvidence] = useState(false);
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const report = result.analysis?.schemaVersion === 1 ? result.analysis : undefined;
  const currency = (value: string): Currency => CURRENCY_CODES.includes(value) ? value as Currency : 'CNY';
  if (hidden) return <Alert message={en ? 'Financial analysis hidden' : '隐私模式已隐藏财务分析'} />;
  function Finding({ item }: { item: AiFinding }) {
    const status = ({ fact: en ? 'Verified fact' : '已核实事实', supported: en ? 'Evidence supports values; causes need review' : '数值有依据，归因待核对', unverified: en ? 'Unverified interpretation' : '尚未核实的解释', recommendation: en ? 'Suggested action' : '行动建议' } as Record<string, string>)[item.status] ?? (en ? 'Needs review' : '待核对');
    return <Card size="small" className="ai-finding" title={item.title} extra={<Tag color={item.status === 'fact' ? 'green' : item.status === 'supported' ? 'blue' : 'orange'}>{status}</Tag>}>
      <AiMarkdown text={item.text} />
      {item.status === 'recommendation' && <Tag color={item.priority === 'urgent' ? 'red' : 'blue'}>{item.priority === 'urgent' ? (en ? 'Priority' : '优先处理') : item.priority === 'long-term' ? (en ? 'Long term' : '长期优化') : (en ? 'Worth attention' : '值得关注')}</Tag>}
      <Space wrap>
        {item.evidenceIds.length > 0 && <Button size="small" onClick={() => { setEvidenceIds(item.evidenceIds); setOpenEvidence(true); }}>{en ? 'View evidence' : '查看依据'}</Button>}
        {item.followUp && onFollowUp && <Button size="small" onClick={() => onFollowUp(item.followUp!)}>{en ? 'Investigate' : '深入分析'}</Button>}
      </Space>
    </Card>;
  }
  const evidence = <><Evidence sources={evidenceIds.length ? result.sources.filter((_, i) => evidenceIds.includes(`e${i}`)) : result.sources} />{evidenceIds.length > 0 && <Button type="link" onClick={() => setEvidenceIds([])}>{en ? 'Show all evidence' : '查看全部依据'}</Button>}</>;
  if (!report) return <section className="ai-analysis" aria-label={en ? 'AI answer' : 'AI 回答'}>
    <AiMarkdown text={result.answer} />
    <Collapse items={[{ key: 'evidence', label: en ? 'Analysis evidence' : '分析依据', children: evidence }]} />
  </section>;
  return <article className="ai-analysis" aria-label={report.reportTitle}>
    <header className="ai-analysis-header">
      <Typography.Title level={3}>{report.reportTitle}</Typography.Title>
      <Space wrap><Tag>{report.currency}</Tag><Tag>{report.confidence === 'unavailable' ? (en ? 'No evidence' : '暂无依据') : report.confidence === 'partial' ? (en ? 'Partial evidence' : '部分依据') : (en ? 'Evidence available' : '已取得依据')}</Tag><span>{report.reportingPeriod}</span></Space>
      <Typography.Paragraph type="secondary">{en ? 'Generated' : '生成时间'} {new Date(report.generatedAt).toLocaleString(locale)}{report.dataAsOf && <> · {en ? 'Data cutoff' : '数据截至'} {new Date(report.dataAsOf).toLocaleString(locale)}</>}</Typography.Paragraph>
      <p>{report.executiveSummary}</p>
    </header>
    {report.keyMetrics.length > 0 && <div className="ai-metric-grid">{report.keyMetrics.map(metric => <Card size="small" key={metric.key}>
      <span>{metric.label}</span><strong className="ai-metric-value" style={{ color: metric.value.startsWith('-') ? 'var(--ant-color-error, #cf1322)' : undefined }}><Money value={metric.value} currency={currency(metric.currency)} /></strong>
      <Button type="link" size="small" onClick={() => { setEvidenceIds([metric.evidenceId]); setOpenEvidence(true); }}>{en ? 'Source' : '数据依据'}</Button>
    </Card>)}</div>}
    <div className="ai-findings">{report.insights.map((item, i) => <Finding key={i} item={item} />)}</div>
    {report.anomalies.length > 0 && <section><Typography.Title level={4}>{en ? 'Transactions investigated' : '交易追踪'}</Typography.Title>{report.anomalies.map((item, i) => <Finding key={i} item={item} />)}</section>}
    {report.trendSeries.length > 1 && <Card size="small" title={en ? 'Income and expense trend' : '收支趋势'}><Chart option={{
      xAxis: { type: 'category', data: report.trendSeries.map(p => p.label) }, yAxis: { type: 'value' }, tooltip: { trigger: 'axis' }, legend: {}, aria: { enabled: true },
      series: [{ name: en ? 'Income' : '收入', type: 'line', data: report.trendSeries.map(p => Number(p.income)) }, { name: en ? 'Expenses' : '支出', type: 'line', data: report.trendSeries.map(p => Number(p.expense)) }],
    }} /></Card>}
    {report.categoryBreakdown.length > 0 && <Card size="small" title={en ? 'Expense categories' : '支出分类'}><Chart option={{
      grid: { left: '30%', right: 20, top: 15, bottom: 30 }, xAxis: { type: 'value' }, yAxis: { type: 'category', inverse: true, data: report.categoryBreakdown.map(c => c.label) },
      tooltip: { trigger: 'axis' }, aria: { enabled: true }, series: [{ type: 'bar', data: report.categoryBreakdown.map(c => Number(c.amount)) }],
    }} onClick={name => { const row = report.categoryBreakdown.find(c => c.label === name); if (row && onFollowUp) onFollowUp(`${en ? 'Investigate category' : '继续核对分类'} ${row.id}，${report.reportingPeriod}，${report.currency}；${en ? 'query transactions and compare the same elapsed period' : '查询对应交易明细并对比上期同期'}。`); }} /></Card>}
    {report.recommendations.length > 0 && <section><Typography.Title level={4}>{en ? 'Recommended actions' : '财务建议'}</Typography.Title>{report.recommendations.map((item, i) => <Finding key={i} item={item} />)}</section>}
    <Collapse activeKey={openEvidence ? ['evidence'] : []} onChange={keys => setOpenEvidence(keys.includes('evidence'))} items={[{ key: 'evidence', label: `${en ? 'Analysis evidence' : '分析依据'} · ${result.sources.length}`, children: evidence }]} />
    {report.limitations.length > 0 && <Alert type="info" showIcon message={en ? 'Data coverage and limitations' : '数据覆盖与限制'} description={<ul>{report.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul>} />}
    {onFollowUp && <Space wrap className="ai-follow-ups">{report.followUpActions.map((action, i) => <Button key={i} onClick={() => onFollowUp(`${report.reportingPeriod} ${report.currency}。${action.prompt}`)}>{action.label}</Button>)}</Space>}
  </article>;
}
function Evidence({ sources }: { sources: AiSource[] }) {
  const en = useLocale() === 'en';
  return sources.length ? <AiEvidenceCards sources={sources} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={en ? 'No ledger evidence' : '暂无账本依据'} />;
}
