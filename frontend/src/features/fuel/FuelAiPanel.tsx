import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Descriptions,
  Popconfirm,
  Select,
  Space,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { aiApi } from '../../api/ai';
import { AiLazyMarkdown } from '../../components/ai/AiLazyMarkdown';
import { fuelAiApi } from './ai';
import type { FuelAiRequest } from './ai';
export default function FuelAiPanel({
  vehicleId,
  from,
  to,
  currency,
  hidden,
  english,
}: {
  vehicleId?: string;
  from: string;
  to: string;
  currency: string;
  hidden: boolean;
  english: boolean;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const cache = useQueryClient();
  const [task, setTask] = useState<FuelAiRequest['task']>('Fuel');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [answer, setAnswer] =
    useState<Awaited<ReturnType<typeof fuelAiApi.analyze>>>();
  const request: FuelAiRequest = {
    vehicleId,
    from:
      task === 'Monthly'
        ? dayjs(to).startOf('month').format('YYYY-MM-DD')
        : from,
    to,
    currency,
    task,
    confirmTransmission: false,
    language: english ? 'en' : 'zh-CN',
  };
  const settings = useQuery({
    queryKey: ['vehicle-ai-settings'],
    queryFn: aiApi.settings,
    enabled: !hidden,
  });
  const evidence = useQuery({
    queryKey: ['fuel', 'ai-evidence', request],
    queryFn: () => fuelAiApi.evidence(request),
    enabled: !hidden,
  });
  const history = useQuery({
    queryKey: ['fuel', 'ai-history', vehicleId],
    queryFn: () => fuelAiApi.history(vehicleId),
    enabled: !hidden,
  });
  async function analyze() {
    setBusy(true);
    setError(undefined);
    setAnswer(undefined);
    try {
      setAnswer(
        await fuelAiApi.analyze(
          { ...request, confirmTransmission: true },
          crypto.randomUUID(),
        ),
      );
      await cache.invalidateQueries({ queryKey: ['fuel', 'ai-history'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  if (hidden) return null;
  const data = evidence.data;
  return (
    <>
      <Alert
        type="info"
        message={tr(
          'AI仅解释真实汇总，确定性计算与离线记账不依赖AI',
          'AI explains real aggregates; deterministic calculations and offline bookkeeping do not depend on AI',
        )}
        description={tr(
          '仅发送期间、油量/金额汇总、区间质量统计、匿名站点价格组和车辆费用汇总，不发送车牌、姓名、商户描述或备注。需已有AI启用及摘要授权，并在此明确确认。AI文本未被验证为财务事实，不能凭油耗升高诊断机械故障。',
          'Sends period, fuel/amount aggregates, interval-quality statistics, anonymous station groups and cost summaries; no plates, names, merchant text or notes. Requires existing AI/summary authorization plus explicit confirmation here. Model text is not verified financial fact and cannot diagnose a mechanical fault from higher consumption.',
        )}
        style={{ marginBottom: 16 }}
      />
      <Space wrap>
        <Select
          aria-label={tr('车辆AI分析任务', 'Vehicle AI task')}
          value={task}
          disabled={busy}
          onChange={(value) => {
            setTask(value);
            setAnswer(undefined);
            setConfirm(false);
          }}
          style={{ width: 230 }}
          options={[
            { value: 'Fuel', label: tr('AI油耗分析师', 'Fuel analyst') },
            { value: 'Costs', label: tr('AI用车成本顾问', 'Cost adviser') },
            {
              value: 'Strategy',
              label: tr('AI加油策略顾问', 'Refuelling adviser'),
            },
            {
              value: 'Health',
              label: tr('AI车辆健康观察', 'Vehicle health observations'),
            },
            {
              value: 'Monthly',
              label: tr(
                'AI月度车辆报告（截至结束日）',
                'Monthly report through end date',
              ),
            },
          ]}
        />
        <Button href="/ai-center">
          {tr('管理现有AI设置', 'Manage existing AI settings')}
        </Button>
      </Space>
      {(settings.isError || evidence.isError) && (
        <Alert
          type="error"
          message={(settings.error ?? evidence.error)?.message}
        />
      )}
      {settings.data &&
        (!settings.data.configured ||
          !settings.data.privacy.enabled ||
          !settings.data.privacy.allowSummary) && (
          <Alert
            type="warning"
            message={tr(
              'AI未配置或未授权摘要；核心计算继续可用',
              'AI is unconfigured or summary consent is missing; core calculations remain available',
            )}
          />
        )}
      {data && (
        <Card
          title={`${tr('计算依据预览', 'Calculation evidence preview')} · ${data.from} → ${data.to}`}
          style={{ marginTop: 12 }}
        >
          <Descriptions
            column={{ xs: 1, sm: 2 }}
            items={[
              {
                key: 'count',
                label: tr('加油次数 / 油量', 'Fills / litres'),
                children: `${data.fuel.count} / ${data.fuel.litres} L`,
              },
              {
                key: 'paid',
                label: tr(
                  '购油实付（非用车总成本）',
                  'Fuel purchases (not total cost)',
                ),
                children: `${data.fuel.amount} ${data.fuel.currency}`,
              },
              {
                key: 'consumption',
                label: tr('有效综合油耗', 'Valid weighted consumption'),
                children:
                  data.fuel.litresPer100Km == null
                    ? tr('数据不足', 'Insufficient data')
                    : `${data.fuel.litresPer100Km} L/100km`,
              },
              {
                key: 'distance',
                label: tr('有效里程 / 区间', 'Valid km / intervals'),
                children: `${data.fuel.distance} / ${data.fuel.completedIntervals}`,
              },
            ]}
          />
          <Typography.Paragraph>
            {tr('区间状态：', 'Interval states: ')}
            {data.intervalStates
              .map((s) => `${s.status}: ${s.count}`)
              .join(' · ')}
          </Typography.Paragraph>
          <Typography.Paragraph>
            {tr('已关联净现金成本：', 'Linked net cash costs: ')}
            {data.cashCosts.map((c) => `${c.net} ${c.currency}`).join(' · ') ||
              '—'}
          </Typography.Paragraph>
        </Card>
      )}
      <Space wrap style={{ margin: '16px 0' }}>
        <Checkbox
          checked={confirm}
          disabled={busy}
          onChange={(e) => setConfirm(e.target.checked)}
        >
          {tr(
            '同意将以上匿名汇总发送至已配置AI供应商',
            'Send these anonymous aggregates to the configured AI provider',
          )}
        </Checkbox>
        <Button
          type="primary"
          loading={busy}
          disabled={
            !confirm ||
            !data ||
            evidence.isFetching ||
            !settings.data?.configured ||
            !settings.data?.privacy.enabled ||
            !settings.data?.privacy.allowSummary
          }
          onClick={() => void analyze()}
        >
          {tr('生成车辆分析', 'Generate vehicle analysis')}
        </Button>
      </Space>
      {error && (
        <Alert
          type="error"
          message={error}
          description={tr(
            '未生成分析，不以模拟结果替代。可继续使用人工记录和确定性统计。',
            'No analysis was generated; simulated results are not substituted. Manual records and deterministic statistics remain available.',
          )}
        />
      )}
      {answer && (
        <Card
          title={tr(
            '模型解释（请以数据依据为准）',
            'Model explanation (verify against evidence)',
          )}
        >
          <AiLazyMarkdown text={answer.advice.text} />
          <Typography.Text type="secondary">
            {tr('依据指纹：', 'Evidence fingerprint: ')}
            {answer.advice.fingerprint}
          </Typography.Text>
        </Card>
      )}
      <Collapse
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'history',
            label: tr(
              '最近20份已保存车辆分析',
              'Latest 20 saved vehicle analyses',
            ),
            children: history.isError ? (
              <Alert type="error" message={history.error.message} />
            ) : (
              history.data?.map((h) => {
                let text = h.text;
                try {
                  text = JSON.parse(h.text).text ?? h.text;
                } catch {
                  /* legacy plain text */
                }
                return (
                  <Card key={h.id} size="small" title={h.createdAt}>
                    <AiLazyMarkdown text={text} />
                    <Popconfirm
                      title={tr('删除这份AI分析？', 'Delete this AI analysis?')}
                      onConfirm={async () => {
                        try {
                          await fuelAiApi.remove(h);
                          await cache.invalidateQueries({
                            queryKey: ['fuel', 'ai-history'],
                          });
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e));
                        }
                      }}
                    >
                      <Button danger>
                        {tr('删除分析', 'Delete analysis')}
                      </Button>
                    </Popconfirm>
                  </Card>
                );
              })
            ),
          },
        ]}
      />
    </>
  );
}
