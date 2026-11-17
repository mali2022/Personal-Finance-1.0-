import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Calendar,
  Card,
  Col,
  Empty,
  Input,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
  App,
} from 'antd';
import dayjs from 'dayjs';
import { useUI } from '../stores/ui';
import {
  blank,
  errorText,
  read,
  write,
  states,
  type Detail,
  type Festival,
  type FestivalInput,
} from '../features/festivals/api';
import { FestivalEditor } from '../features/festivals/FestivalEditor';
import { FestivalDetail } from '../features/festivals/FestivalDetail';
import { FestivalRecipients } from '../features/festivals/FestivalRecipients';
type Definition = {
  id: string;
  name: string;
  kind: string;
  date: string;
  region: string;
};
export default function FestivalsPage() {
  const { message } = App.useApp();
  const yearNow = Number(
    new Intl.DateTimeFormat('en', {
      year: 'numeric',
      timeZone: 'Asia/Shanghai',
    }).format(new Date()),
  );
  const [year, setYear] = useState(yearNow);
  const [compareYear, setCompareYear] = useState(yearNow - 1);
  const [view, setView] = useState('列表');
  const [kind, setKind] = useState('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string>();
  const [editor, setEditor] = useState(false);
  const [editing, setEditing] = useState<Festival>();
  const [draft, setDraft] = useState<FestivalInput>();
  const [busy, setBusy] = useState(false);
  const [currency, setCurrency] = useState('CNY');
  const hidden = useUI((s) => s.hidden);
  const money = (v: number) => (hidden ? '••••' : v.toFixed(2));
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['festival-annual', year],
    queryFn: () => read<{ items: Detail[] }>('/annual?year=' + year),
  });
  const comparison = useQuery({
    queryKey: ['festival-annual', compareYear],
    queryFn: () => read<{ items: Detail[] }>('/annual?year=' + compareYear),
  });
  const definitions = useQuery({
    queryKey: ['festival-definitions', year],
    queryFn: () => read<Definition[]>('/definitions?year=' + year),
  });
  const selectedDetail = useQuery({
    queryKey: ['festival', selected],
    queryFn: () => read<Detail>('/' + selected),
    enabled: !!selected,
  });
  const data = q.data?.items ?? [];
  const rows = data.filter(
    (x) =>
      !x.document.input.hidden &&
      (kind === 'All' || x.document.input.kind === kind) &&
      x.document.input.name.includes(search),
  );
  const same = data.filter((x) => x.report.currency === currency);
  const totals = (key: 'budget' | 'net' | 'available') =>
    same.reduce((n, x) => n + Number(x.report[key]), 0);
  const create = (input?: FestivalInput) => {
    setEditing(undefined);
    setDraft(input ?? blank());
    setEditor(true);
  };
  const save = async (input: FestivalInput) => {
    setBusy(true);
    try {
      await write(
        editing ? '/' + editing.id : '',
        input,
        editing?.version ?? '0',
        editing ? 'put' : 'post',
      );
      setEditor(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['festival-annual'] }),
        qc.invalidateQueries({ queryKey: ['festival'] }),
      ]);
      message.success('节日计划已保存');
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const cards = (
    <Row gutter={[16, 16]}>
      {rows.map(({ document: d, report: r }) => (
        <Col xs={24} md={12} xl={8} key={d.id}>
          <Card
            title={
              <Space>
                {d.input.name}
                <Tag>{states[d.input.state]}</Tag>
              </Space>
            }
            actions={[
              <Button key="open" type="link" onClick={() => setSelected(d.id)}>
                查看计划
              </Button>,
              <Button
                key="edit"
                type="link"
                onClick={() => {
                  setEditing(d);
                  setDraft(undefined);
                  setEditor(true);
                }}
              >
                编辑
              </Button>,
            ]}
          >
            <Typography.Text type="secondary">
              {d.input.startsOn} 至 {d.input.endsOn}
            </Typography.Text>
            <p>
              {r.countdown >= 0 ? `还有 ${r.countdown} 天` : '已开始 / 已结束'}{' '}
              · {r.currency}
            </p>
            <Row gutter={8}>
              <Col span={12}>
                <Statistic
                  title="计划预算"
                  value={hidden ? '••••' : r.budget}
                />
              </Col>
              <Col span={12}>
                <Statistic title="净支出" value={hidden ? '••••' : r.net} />
              </Col>
            </Row>
            <p>
              可用预算：{hidden ? '••••' : r.available} · 采购：{r.purchased}/
              {r.totalPurchases}
            </p>
            {!r.complete && <Tag color="warning">存在待核对归属</Tag>}
          </Card>
        </Col>
      ))}
    </Row>
  );
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
        <div>
          <Typography.Title level={2}>节日与纪念日财务中心</Typography.Title>
        </div>
        <Space>
          <Select
            aria-label="年度"
            value={year}
            onChange={setYear}
            options={Array.from({ length: 11 }, (_, i) => ({
              value: yearNow - 5 + i,
              label: String(yearNow - 5 + i),
            }))}
          />
          <Button type="primary" onClick={() => create()}>
            创建节日计划
          </Button>
        </Space>
      </Space>
      <Space wrap>
        <Select
          aria-label="报告币种"
          value={currency}
          onChange={setCurrency}
          options={['CNY', 'USD', 'EUR', 'HKD', 'JPY', 'GBP'].map((value) => ({
            value,
            label: value,
          }))}
        />
      </Space>
      <Row gutter={[12, 12]}>
        {[
          ['年度节日预算', money(totals('budget'))],
          ['年度实际净支出', money(totals('net'))],
          ['剩余可用预算', money(totals('available'))],
          [
            '即将到来',
            String(
              rows.filter(
                (x) =>
                  x.report.countdown >= 0 &&
                  x.document.input.state !== 'Cancelled',
              ).length,
            ),
          ],
        ].map(([title, value]) => (
          <Col xs={12} lg={6} key={title}>
            <Card>
              <Statistic title={title} value={value} />
            </Card>
          </Col>
        ))}
      </Row>
      <Space wrap>
        <Segmented
          options={['列表', '月视图', '年视图', '跨年比较', '送礼对象']}
          value={view}
          onChange={setView}
        />
        <Select
          aria-label="节日类别"
          value={kind}
          onChange={setKind}
          style={{ width: 130 }}
          options={[
            { value: 'All', label: '全部类别' },
            { value: 'Traditional', label: '传统节日' },
            { value: 'International', label: '国际节日' },
            { value: 'Shopping', label: '购物节' },
            { value: 'Personal', label: '个人纪念日' },
          ]}
        />
        <Input.Search placeholder="搜索节日名称" onSearch={setSearch} />
      </Space>
      {q.isLoading ? (
        <Card loading />
      ) : q.isError ? (
        <Alert
          type="error"
          message="节日数据加载失败"
          action={<Button onClick={() => q.refetch()}>重试</Button>}
        />
      ) : view === '送礼对象' ? (
        <FestivalRecipients />
      ) : view === '月视图' ? (
        <Card>
          <Calendar
            key={year}
            defaultValue={dayjs(`${year}-01-01`)}
            onPanelChange={(v) => setYear(v.year())}
            cellRender={(date, info) =>
              info.type === 'date'
                ? rows
                    .filter(
                      (x) =>
                        x.document.input.startsOn === date.format('YYYY-MM-DD'),
                    )
                    .map((x) => (
                      <div key={x.document.id}>
                        <Button
                          type="link"
                          size="small"
                          onClick={() => setSelected(x.document.id)}
                        >
                          {x.document.input.name}
                        </Button>
                      </div>
                    ))
                : info.originNode
            }
          />
        </Card>
      ) : view === '年视图' ? (
        <Row gutter={[12, 12]}>
          {Array.from({ length: 12 }, (_, month) => (
            <Col xs={24} md={12} xl={8} key={month}>
              <Card title={`${month + 1}月`}>
                {rows
                  .filter(
                    (x) =>
                      Number(x.document.input.startsOn.slice(5, 7)) ===
                      month + 1,
                  )
                  .map((x) => (
                    <p key={x.document.id}>
                      <Button
                        type="link"
                        onClick={() => setSelected(x.document.id)}
                      >
                        {x.document.input.name} · {x.document.input.startsOn}
                      </Button>
                    </p>
                  ))}
              </Card>
            </Col>
          ))}
        </Row>
      ) : view === '跨年比较' ? (
        <Card title="同类节日跨年比较">
          <Select
            value={compareYear}
            onChange={setCompareYear}
            options={Array.from({ length: 11 }, (_, i) => ({
              value: yearNow - 5 + i,
              label: String(yearNow - 5 + i),
            }))}
            style={{ marginBottom: 12 }}
          />
          {rows.map((x) => {
            const prior =
              comparison.data?.items.filter(
                (p) =>
                  p.document.input.definition === x.document.input.definition &&
                  p.document.input.currency === x.document.input.currency &&
                  (x.document.input.definition !== 'custom' ||
                    p.document.input.name === x.document.input.name),
              ) ?? [];
            return (
              <Card
                key={x.document.id}
                size="small"
                title={x.document.input.name}
              >
                <p>
                  {year}：{hidden ? '••••' : x.report.net} {x.report.currency}
                </p>
                {prior.length ? (
                  prior.map((p) => (
                    <p key={p.document.id}>
                      {compareYear}：{hidden ? '••••' : p.report.net}{' '}
                      {p.report.currency} · {p.document.input.startsOn} 至{' '}
                      {p.document.input.endsOn}
                      {!p.report.complete && '（待核对）'}
                    </p>
                  ))
                ) : (
                  <p>暂无同币种可比记录</p>
                )}
              </Card>
            );
          })}
        </Card>
      ) : rows.length ? (
        cards
      ) : (
        <Empty description="暂无节日计划" />
      )}
      <Card title="可选节日模板">
        <Space wrap>
          {definitions.data?.map((d) => (
            <Button
              key={d.id}
              onClick={() =>
                create({
                  ...blank(),
                  name: d.name,
                  startsOn: d.date,
                  endsOn: d.date,
                  definition: d.id,
                  kind: d.kind,
                  region: d.region,
                })
              }
            >
              {d.name} · {d.date}
            </Button>
          ))}
        </Space>
        {definitions.isError && (
          <Button onClick={() => definitions.refetch()}>重试模板加载</Button>
        )}
      </Card>
      <FestivalEditor
        value={editing?.input ?? draft}
        isNew={!editing}
        open={editor}
        busy={busy}
        onClose={() => setEditor(false)}
        onSave={save}
      />
      <Modal
        title="节日详情"
        open={!!selected}
        width={1250}
        footer={null}
        onCancel={() => setSelected(undefined)}
        destroyOnHidden
      >
        {selected && (
          <FestivalDetail
            key={selected}
            id={selected}
            onEdit={() => {
              if (selectedDetail.data) {
                setEditing(selectedDetail.data.document);
                setDraft(undefined);
                setEditor(true);
              }
            }}
          />
        )}
      </Modal>
    </Space>
  );
}
