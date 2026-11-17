import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
} from 'antd';
import { apiClient } from '../../api/client';
export interface StationInput {
  name: string;
  brand: string;
  address: string;
  aliases: string[];
  favorite: boolean;
  archived: boolean;
}
export interface StationRow {
  id: string;
  version: string;
  input: StationInput;
}
export const stationApi = {
  list: async () =>
    (await apiClient.get<{ data: StationRow[] }>('/fuel/stations')).data.data,
  save: async (input: StationInput, key: string, row?: StationRow) =>
    apiClient.request({
      method: row ? 'put' : 'post',
      url: '/fuel/stations' + (row ? '/' + row.id : ''),
      data: input,
      headers: {
        'Idempotency-Key': key,
        ...(row ? { 'If-Match': row.version } : {}),
      },
    }),
  merge: async (source: StationRow, target: StationRow, key: string) =>
    apiClient.post(
      '/fuel/stations/' + source.id + '/merge',
      { targetId: target.id, targetVersion: target.version },
      { headers: { 'Idempotency-Key': key, 'If-Match': source.version } },
    ),
};
export default function FuelStationsPanel({
  hidden,
  english,
}: {
  hidden: boolean;
  english: boolean;
}) {
  const tr = (zh: string, en: string) => (english ? en : zh);
  const cache = useQueryClient();
  const q = useQuery({
    queryKey: ['fuel', 'stations'],
    queryFn: stationApi.list,
    enabled: !hidden,
  });
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StationRow>();
  const [source, setSource] = useState<StationRow>();
  const [target, setTarget] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [key, setKey] = useState('');
  function edit(row?: StationRow) {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue(
      row?.input ?? {
        name: '',
        brand: '',
        address: '',
        aliases: [],
        favorite: false,
        archived: false,
      },
    );
    setError(undefined);
    setKey(crypto.randomUUID());
    setOpen(true);
  }
  async function save() {
    try {
      const input = await form.validateFields();
      setBusy(true);
      await stationApi.save(
        {
          ...input,
          aliases: input.aliases ?? [],
          brand: input.brand ?? '',
          address: input.address ?? '',
        },
        key,
        editing,
      );
      setOpen(false);
      await cache.invalidateQueries({ queryKey: ['fuel'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function merge() {
    const destination = q.data?.find((r) => r.id === target);
    if (!source || !destination) return;
    setBusy(true);
    try {
      await stationApi.merge(source, destination, key);
      setSource(undefined);
      await cache.invalidateQueries({ queryKey: ['fuel'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  if (hidden) return null;
  return (
    <>
      <Button onClick={() => edit()} style={{ margin: '12px 0' }}>
        {tr('新增站点', 'Add station')}
      </Button>
      {q.isError && <Alert type="error" message={q.error.message} />}
      <Table<StationRow>
        rowKey="id"
        dataSource={q.data}
        loading={q.isFetching}
        scroll={{ x: 700 }}
        pagination={{ pageSize: 10 }}
        columns={[
          {
            title: tr('名称', 'Name'),
            render: (_, r) =>
              `${r.input.favorite ? '★ ' : ''}${r.input.name}${r.input.archived ? tr('（已归档）', ' (archived)') : ''}`,
          },
          {
            title: tr('品牌 / 地址', 'Brand / address'),
            render: (_, r) => `${r.input.brand} / ${r.input.address}`,
          },
          {
            title: tr('历史别名', 'Historical aliases'),
            render: (_, r) => r.input.aliases.join(' · '),
          },
          {
            title: tr('操作', 'Actions'),
            render: (_, r) => (
              <Space>
                <Button onClick={() => edit(r)}>{tr('编辑', 'Edit')}</Button>
                <Button
                  onClick={() => {
                    setSource(r);
                    setTarget(undefined);
                    setKey(crypto.randomUUID());
                    setError(undefined);
                  }}
                >
                  {tr('合并至…', 'Merge into…')}
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        open={open && !hidden}
        title={tr('站点资料', 'Station profile')}
        onCancel={() => !busy && setOpen(false)}
        onOk={() => void save()}
        confirmLoading={busy}
      >
        {error && <Alert type="error" message={error} />}
        <Form name="fuel-station" form={form} layout="vertical" disabled={busy}>
          <Form.Item
            name="name"
            label={tr('站点名称', 'Station name')}
            rules={[{ required: true, max: 160 }]}
          >
            <Input maxLength={160} />
          </Form.Item>
          <Form.Item name="brand" label={tr('品牌', 'Brand')}>
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="address" label={tr('地址', 'Address')}>
            <Input maxLength={500} />
          </Form.Item>
          <Form.Item
            name="aliases"
            label={tr(
              '历史站名别名（输入后回车）',
              'Historical station aliases (press Enter)',
            )}
          >
            <Select mode="tags" />
          </Form.Item>
          <Form.Item name="favorite" valuePropName="checked">
            <Checkbox>{tr('收藏', 'Favorite')}</Checkbox>
          </Form.Item>
          <Form.Item name="archived" valuePropName="checked">
            <Checkbox>{tr('归档', 'Archived')}</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        open={!!source && !hidden}
        title={tr('确认同一站点合并', 'Confirm same-station merge')}
        onCancel={() => !busy && setSource(undefined)}
        onOk={() => void merge()}
        okButtonProps={{ disabled: !target }}
        confirmLoading={busy}
      >
        {error && <Alert type="error" message={error} />}
        <p>
          {source?.input.name} →{' '}
          {tr(
            '以目标名称、品牌、地址为准，合入源别名。不会修改加油事实。',
            'Keep target name, brand and address; combine aliases. Fuel facts are unchanged.',
          )}
        </p>
        <Select
          style={{ width: '100%' }}
          aria-label={tr('目标站点', 'Target station')}
          value={target}
          onChange={setTarget}
          options={q.data
            ?.filter((r) => r.id !== source?.id)
            .map((r) => ({ value: r.id, label: r.input.name }))}
        />
      </Modal>
    </>
  );
}
