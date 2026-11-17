import { App, Button, Drawer, Form, Input, InputNumber } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { DatePicker } from '../../components/ResponsiveDatePicker';
import { Select } from '../../components/TouchSelect';
import { t as tr } from '../../i18n';
import { concertApi } from './api';
import type { Concert, Scene } from './api';
import { categories, sceneStates } from './labels';
import { currencyOptions } from '../../constants/currencies';
import { PaymentParts } from './PaymentParts';
import { TicketRecords, ticketGiftError } from './TicketRecords';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { concertTimeZone } from './time';
import { interestApi } from './interestApi';
import { ArtistAllocations } from './ArtistAllocations';
import { RecoveryPayments } from './RecoveryPayments';
import { CategorySelector, AccountSelector } from '../../components/Selectors';
import { TicketOriginFields } from './TicketOriginFields';
import { SceneAttachments } from './SceneAttachments';
import { PurchaseItemLink } from './PurchaseItemLink';
export interface Field {
  name: string;
  label: string;
  kind?:
    | 'date'
    | 'datetime'
    | 'number'
    | 'amount'
    | 'text'
    | 'textarea'
    | 'payments'
    | 'tickets'
    | 'recovery-income'
    | 'recovery-expense'
    | 'category'
    | 'account'
    | 'ticket-origin'
    | 'scene-attachments'
    | 'purchase-item-link'
    | 'artist-allocation';
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  disabled?: boolean;
  search?: (value: string) => void;
  currency?: string;
  multiple?: boolean;
  maxLength?: number;
}
function fieldInput(field: Field) {
  if(field.kind==='purchase-item-link')return <PurchaseItemLink disabled={field.disabled}/>;
  if(field.kind==='scene-attachments') return <SceneAttachments disabled={field.disabled}/>;
  if(field.kind==='category') return <CategorySelector disabled={field.disabled}/>;
  if(field.kind==='account') return <AccountSelector currency={field.currency}/>;
  if(field.kind==='ticket-origin') return <TicketOriginFields disabled={field.disabled}/>;
  if(field.kind==='recovery-income'||field.kind==='recovery-expense') return <RecoveryPayments kind={field.kind==='recovery-income'?'Income':'Expense'} currency={field.currency} disabled={field.disabled}/>;
  if (field.kind === 'artist-allocation') return <ArtistAllocations options={field.options ?? []} disabled={field.disabled} />;
  if (field.kind === 'tickets') return <TicketRecords disabled={field.disabled} currency={field.currency} />;
  if (field.kind === 'payments')
    return (
      <PaymentParts
        options={field.options || []}
        onSearch={field.search}
        disabled={field.disabled}
      />
    );
  if (field.options)
    return (
      <Select
        mode={field.multiple?'multiple':undefined}
        allowClear={!field.required}
        showSearch
        optionFilterProp="label"
        options={field.options}
        disabled={field.disabled}
        onSearch={field.search}
        filterOption={field.search ? false : undefined}
      />
    );
  if (field.kind === 'date' || field.kind === 'datetime')
    return (
      <DatePicker
        style={{ width: '100%' }}
        showTime={field.kind === 'datetime'}
      />
    );
  if (field.kind === 'number')
    return <InputNumber min={0} style={{ width: '100%' }} />;
  if (field.kind === 'textarea')
    return <Input.TextArea rows={3} maxLength={field.maxLength??2000} />;
  return (
    <Input
      maxLength={field.kind === 'amount' ? 21 : 200}
      inputMode={field.kind === 'amount' ? 'decimal' : 'text'}
    />
  );
}
export function DataEditor({
  title,
  fields,
  value,
  onSave,
  onClose,
  onValuesChange,
}: {
  title: string;
  fields: Field[];
  value: Record<string, unknown>;
  onSave: (v: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
  onValuesChange?: (values:Record<string,unknown>)=>void;
}) {
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const { message } = App.useApp();
  const initialFields = useRef(fields);
  useEffect(() => {
    const data = { ...value };
    for (const f of initialFields.current)
      if (f.kind === 'date' || f.kind === 'datetime')
        data[f.name] = data[f.name] ? dayjs(String(data[f.name])) : undefined;
    form.setFieldsValue(data);
  }, [form, value]);
  return (
    <Drawer
      title={title}
      open
      width="min(600px, 100vw)"
      onClose={() => !busy && onClose()}
      extra={
        <Button
          aria-label={tr('保存')}
          type="primary"
          loading={busy}
          onClick={() => form.submit()}
        >
          {tr('保存')}
        </Button>
      }
    >
      <Form
        form={form}
        layout="vertical"
        disabled={busy}
        onValuesChange={onValuesChange}
        onFinish={async (v) => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          try {
            const data = { ...value, ...v };
            for (const f of fields) {
              if (f.kind === 'date' || f.kind === 'datetime')
                data[f.name] = v[f.name]
                  ? f.kind === 'date'
                    ? v[f.name].format('YYYY-MM-DD')
                    : v[f.name].toISOString()
                  : null;
              else if (f.kind === 'amount') data[f.name] = v[f.name] || '0.00';
              else if (f.options && f.kind !== 'payments' && !v[f.name])
                data[f.name] = null;
            }
            await onSave(data);
          } catch (e) {
            message.error((e as Error).message);
          } finally {
            lock.current = false;
            setBusy(false);
          }
        }}
      >
        {fields.map((f) => (
          <Form.Item
            key={f.name}
            name={f.name}
            label={tr(f.label)}
            extra={f.hint ? tr(f.hint) : undefined}
            rules={[
              ...(f.kind === 'tickets' ? [{ validator: (_: unknown, tickets: import('./api').Ticket[]) => { const error = ticketGiftError(tickets); return error ? Promise.reject(new Error(error)) : Promise.resolve(); } }] : []),
              ...(f.required
                ? [{ required: true, message: tr('请填写此项') }]
                : []),
              ...(f.kind === 'amount'
                ? [
                    {
                      pattern: /^\d{1,18}(\.\d{1,2})?$/,
                      message: tr('请输入非负金额，最多两位小数'),
                    },
                  ]
                : []),
            ]}
          >
            {fieldInput({ ...f, disabled: busy || f.disabled })}
          </Form.Item>
        ))}
      </Form>
    </Drawer>
  );
}
export function SceneEditor({
  scene,
  scenes,
  onClose,
  onSaved,
}: {
  scene?: Scene;
  scenes: Scene[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const source = useRef(scene);
  const cache = useQueryClient();
  const tours = useQuery({ queryKey: ['concert-tours'], queryFn: concertApi.tours });
  const catalog = useQuery({ queryKey: ['music-catalog'], queryFn: interestApi.catalog });
  const [input] = useState<Concert>(
    () =>
      scene?.input || {
        artist: '',
        artistLink: { artistId: null },
        tourName: '',
        tourId: null,
        title: '',
        startsAt: dayjs().add(1, 'day').toISOString(),
        city: '',
        venue: '',
        sessionNumber: '',
        organizer: '',
        platform: '',
        currency: 'CNY',
        totalBudget: '0.00',
        expectedPeople: 1,
        actualPeople: 0,
        note: '',
        state: 'Planning',
        attachmentIds: [],
        budgets: [],
        orders: [],
        costs: [],
        plans: [],
        refunds: [],
        companions: [],
      },
  );
  const value = useMemo<Record<string, unknown>>(
    () => ({
      ...input,
      timeZone: concertTimeZone(input),
      artistAllocation: input.artistAllocation ?? null,
      artistReference: input.artistLink ? input.artistLink.artistId ?? '__none__' : '__legacy__',
      ...Object.fromEntries(
        input.budgets.map((x) => ['budget' + x.category, x.amount]),
      ),
    }),
    [input],
  );
  const fields: Field[] = [
    { name: 'artist', label: '艺人名称', required: true },
    {
      name: 'artistReference', label: '关联主艺人 / 乐队档案', required: true,
      hint: catalog.isError ? '艺人档案加载失败，请关闭表单后重试。已有引用会保留。' : '选择后按档案名称保存；明确不关联时不再同名归属。联合模式下，费用归属以联合比例为准。',
      disabled: catalog.isPending || catalog.isError,
      options: [
        { value: '__none__', label: '不关联艺人档案（保留显示名称）' },
        ...(!input.artistLink ? [{ value: '__legacy__', label: '保留旧档案名称口径（未建立身份关联）' }] : []),
        ...(catalog.data?.topics.filter(t => t.input.kind === 'Artist').map(t => ({ value: t.id, label: [t.input.name, ...(t.input.artistProfile?.aliases ?? [])].join(' / ') })) ?? []),
      ],
    },
    {name:'eventType',label:'演出类型',options:[{value:'Concert',label:'演唱会'},{value:'JointConcert',label:'联合演出'},{value:'Festival',label:'音乐节'}],hint:'联合演出与音乐节可在下方明确多艺人比例；零比例可保留参与关系，未分配费用单列。'},
    { name: 'artistAllocation', label: '联合演出艺人费用归属', kind: 'artist-allocation', disabled: catalog.isPending || catalog.isError,
      options: catalog.data?.topics.filter(t => t.input.kind === 'Artist').map(t => ({ value: t.id, label: [t.input.name, ...(t.input.artistProfile?.aliases ?? [])].join(' / ') })) ?? [] },
    { name: 'tourName', label: '巡演名称' },
    {
      name: 'tourId',
      label: '所属巡演分组（可选）',
      hint: '可先在巡演档案中新建；历史分组仍可保留或解除。',
      options: [
        ...new Map(
          [...scenes
            .filter((x) => x.input.tourId)
            .map((x) => [
              x.input.tourId!,
              {
                value: x.input.tourId!,
                label: x.input.tourName || x.input.artist,
              },
            ] as const), ...(tours.data ?? []).map(tour => [tour.id, { value: tour.id, label: `${tour.input.name} · ${tour.input.artist}` }] as const)],
        ).values(),
      ],
    },
    { name: 'title', label: '演出标题', required: true },
    {
      name: 'startsAt',
      label: '开始时间（当前设备时区）',
      hint: `输入采用设备时区 ${Intl.DateTimeFormat().resolvedOptions().timeZone}；保存后按场次当地时区显示。修改时区不移动已保存的实际时刻。`,
      kind: 'datetime',
      required: true,
    },
    { name: 'timeZone', label: '演出当地时区（IANA）', required: true, hint: '例如 Asia/Shanghai、Asia/Tokyo、America/New_York；历史档案默认为 Asia/Shanghai。' },
    { name: 'city', label: '城市', required: true },
    { name: 'venue', label: '场馆', required: true },
    { name: 'sessionNumber', label: '场次编号（内部）' },
    { name: 'organizer', label: '主办方' },
    { name: 'platform', label: '票务平台' },
    {
      name: 'currency',
      label: '币种',
      options: currencyOptions(),
      required: true,
    },
    {
      name: 'totalBudget',
      label: '场次总预算',
      kind: 'amount',
      required: true,
    },
    ...['Ticket', 'Transport', 'Hotel', 'Food', 'Merch', 'Other'].map(
      (category) => ({
        name: 'budget' + category,
        label: categories[category] + '预算',
        kind: 'amount' as const,
      }),
    ),
    {
      name: 'expectedPeople',
      label: '预计参加人数',
      kind: 'number',
      required: true,
    },
    {
      name: 'actualPeople',
      label: '实际参加人数',
      kind: 'number',
      required: true,
    },
    {
      name: 'state',
      label: '场次状态',
      required: true,
      options: Object.entries(sceneStates).map(([value, label]) => ({
        value,
        label: tr(label),
      })),
    },
    { name: 'note', label: '备注', kind: 'textarea' },
  ];
  return (
    <DataEditor
      title={tr(scene ? '编辑演唱会档案' : '新增演唱会档案')}
      fields={fields}
      value={value}
      onClose={onClose}
      onSave={async (v) => {
        try { new Intl.DateTimeFormat('zh-CN', { timeZone: String(v.timeZone) }); }
        catch { throw new Error('请输入有效的IANA时区，例如 Asia/Shanghai'); }
        const b = {
          ...input,
          ...v,
          tourId: v.tourId || null,
          tourName: tours.data?.find(tour => tour.id === v.tourId)?.input.name || v.tourName || '',
          artistLink: v.artistReference === '__legacy__' ? null : { artistId: v.artistReference === '__none__' ? null : String(v.artistReference) },
          budgets: [
            'Ticket',
            'Transport',
            'Hotel',
            'Food',
            'Merch',
            'Other',
          ].map((category) => ({
            category,
            amount: String(v['budget' + category] || '0.00'),
          })),
        } as Concert;
        for (const key of Object.keys(b))
          if (key.startsWith('budget') && key !== 'budgets')
            delete (b as unknown as Record<string, unknown>)[key];
        delete (b as unknown as Record<string, unknown>).artistReference;
        await concertApi.save(b, source.current);
        await cache.invalidateQueries({ queryKey: ['concert-tours'] });
        await cache.invalidateQueries({ queryKey: ['concert', 'tour-report'] });
        await cache.invalidateQueries({ queryKey: ['music-report'] });
        await onSaved();
        onClose();
      }}
    />
  );
}
