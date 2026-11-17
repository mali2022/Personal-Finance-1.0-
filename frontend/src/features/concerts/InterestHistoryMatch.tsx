import { useState } from 'react';
import {
  App,
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Table,
} from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import type { ApiResponse } from '../../types';
import type { Topic } from './interestApi';
interface Candidate {
  id: string;
  merchant: string;
  note: string;
  productName: string | null;
  amount: string;
  available: string;
  recommendations: { name: string; reason: string }[];
}
export function InterestHistoryMatch({ topics }: { topics: Topic[] }) {
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [artist, setArtist] = useState<string>();
  const [brand, setBrand] = useState<string>();
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [busy, setBusy] = useState(false);
  const candidates = useQuery({
    queryKey: ['music-candidates', keyword, page],
    enabled: open,
    queryFn: () =>
      apiClient
        .get<ApiResponse<Candidate[]>>('/concerts/interests/candidates', {
          params: { currency: 'CNY', page, keyword: keyword || undefined },
        })
        .then((r) => r.data.data),
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}>发现并确认关联历史消费</Button>
      <Modal
        open={open}
        width={1000}
        footer={null}
        title="历史消费匹配（仅建议，确认后写入专题）"
        onCancel={() => setOpen(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="warning"
            message="文字匹配不能判断官方归属或订单内容。批量关联按整笔 CNY 订单金额登记；包含普通商品、已部分关联或有退款的订单请使用商品明细逐笔分配。不会修改原交易分类。"
          />
          <Input.Search
            onSearch={(v) => {
              setKeyword(v);
              setPage(1);
            }}
            placeholder="品牌、艺人、商品或备注关键词"
          />
          <Space wrap>
            <Select
              allowClear
              placeholder="艺人，可选"
              onChange={setArtist}
              options={topics
                .filter((t) => t.input.kind === 'Artist')
                .map((t) => ({ value: t.id, label: t.input.name }))}
              style={{ width: 180 }}
            />
            <Select
              allowClear
              placeholder="品牌，可选"
              onChange={setBrand}
              options={topics
                .filter((t) => t.input.kind === 'Brand')
                .map((t) => ({ value: t.id, label: t.input.name }))}
              style={{ width: 180 }}
            />
            <Button
              disabled={!selected.length || (!artist && !brand)}
              loading={busy}
              onClick={() =>
                modal.confirm({
                  title: `确认将 ${selected.length} 笔整单金额关联到所选专题？`,
                  content:
                    '请确认整笔订单均属于该专题。可以之后编辑购买记录解除关联，原交易保持存在。',
                  onOk: async () => {
                    setBusy(true);
                    try {
                      await apiClient.post(
                        '/concerts/interests/batch-link',
                        {
                          transactionIds: selected,
                          artistId: artist || null,
                          brandId: brand || null,
                          confirm: true,
                        },
                        { headers: { 'Idempotency-Key': crypto.randomUUID() } },
                      );
                      setSelected([]);
                      await Promise.all(
                        [
                          'music-purchases',
                          'music-report',
                          'music-candidates',
                        ].map((k) =>
                          cache.invalidateQueries({ queryKey: [k] }),
                        ),
                      );
                      message.success('已关联；可在购买档案中调整或解除');
                    } catch (e) {
                      message.error((e as Error).message || '操作失败，请重试');
                      throw e;
                    } finally {
                      setBusy(false);
                    }
                  },
                })
              }
            >
              确认批量关联
            </Button>
          </Space>
          <Table
            rowKey="id"
            dataSource={candidates.data}
            loading={candidates.isPending}
            rowSelection={{
              selectedRowKeys: selected,
              onChange: setSelected,
              getCheckboxProps: (r) => ({ disabled: r.amount !== r.available }),
            }}
            pagination={false}
            scroll={{ x: 700 }}
            columns={[
              {
                title: '商户 / 商品',
                render: (_, r) => `${r.merchant || ''} ${r.productName || ''}`,
              },
              { title: '备注', dataIndex: 'note' },
              { title: '订单实付', dataIndex: 'amount' },
              { title: '未分配', dataIndex: 'available' },
              {
                title: '规则推荐（需确认）',
                render: (_, r) =>
                  r.recommendations.map((x) => x.name).join('、') ||
                  '无可靠匹配',
              },
            ]}
          />
          <Space>
            <Button
              disabled={page === 1}
              onClick={() => {
                setPage(page - 1);
                setSelected([]);
              }}
            >
              上一页
            </Button>
            <span>第 {page} 页</span>
            <Button
              disabled={(candidates.data?.length || 0) < 20}
              onClick={() => {
                setPage(page + 1);
                setSelected([]);
              }}
            >
              下一页
            </Button>
          </Space>
          {candidates.isError && <Card>查询失败，请重试。</Card>}
        </Space>
      </Modal>
    </>
  );
}
