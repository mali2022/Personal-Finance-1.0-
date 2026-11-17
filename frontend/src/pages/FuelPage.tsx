import FuelReceiptFields from '../features/fuel/FuelReceiptFields';
import FuelDiscountFields from '../features/fuel/FuelDiscountFields';
import {
  lazy,
  Suspense,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { fuelWorkspace } from '../features/fuel/workspace';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Collapse,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Radio,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
} from 'antd';
import dayjs from 'dayjs';
import { PageTitle } from '../components/PageTitle';
import { ErrorState } from '../components/Feedback';
import { useLocale } from '../i18n';
import { useUI } from '../stores/ui';
import { CURRENCY_CODES } from '../constants/currencies';
import priceReference from '../data/fuel-price-reference.json';
import { litresFromPrice } from '../features/fuel/calculation';
import { fuelApi, fuelCsv } from '../features/fuel/api';
import FuelCalculationDetails from '../features/fuel/FuelCalculationDetails';
import FuelQualityPanel from '../features/fuel/FuelQualityPanel';
import FuelImportDialog from '../features/fuel/FuelImportDialog';
import FuelRecordFilters from '../features/fuel/FuelRecordFilters';
import FuelBulkActions from '../features/fuel/FuelBulkActions';
import FuelTrashPanel from '../features/fuel/FuelTrashPanel';
import { fuelRecordFilters, filterFuelRecords } from '../features/fuel/records';
import FuelStrategyPanel from '../features/fuel/FuelStrategyPanel';
import VehicleProfileFields, {
  energyLabels,
} from '../features/fuel/VehicleProfileFields';
import VehicleProfileCard from '../features/fuel/VehicleProfileCard';
import FuelPricesPanel, {
  fuelGradeOptions,
} from '../features/fuel/FuelPricesPanel';
import type { FuelRow, Vehicle } from '../features/fuel/api';
const FuelInsightsPanel = lazy(
  () => import('../features/fuel/FuelInsightsPanel'),
);
const VehicleValuePanel = lazy(
  () => import('../features/fuel/VehicleValuePanel'),
);
const FuelStationsPanel = lazy(
  () => import('../features/fuel/FuelStationsPanel'),
);
const VehicleCostsPanel = lazy(
  () => import('../features/fuel/VehicleCostsPanel'),
);
const FuelAiPanel = lazy(() => import('../features/fuel/FuelAiPanel'));
const VehicleDecisionsPanel = lazy(
  () => import('../features/fuel/VehicleDecisionsPanel'),
);
const VehiclePlanningPanel = lazy(
  () => import('../features/fuel/VehiclePlanningPanel'),
);
const FuelOverviewPanel = lazy(
  () => import('../features/fuel/FuelOverviewPanel'),
);
const Chart = lazy(() => import('../components/Chart'));
export default function FuelPage() {
  const en = useLocale() === 'en';
  const tr = (zh: string, english: string) => (en ? english : zh);
  const hidden = useUI((s) => s.hidden);
  const { message, modal } = App.useApp();
  const cache = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const { tab, vehicleId, currency, range } = fuelWorkspace(search);
  const updateSearch = useCallback(
    (values: Record<string, string | undefined>, replace = false) => {
      setSearch(
        (previous) => {
          const next = new URLSearchParams(previous);
          Object.entries(values).forEach(([key, value]) =>
            value ? next.set(key, value) : next.delete(key),
          );
          return next;
        },
        { replace },
      );
    },
    [setSearch],
  );
  const setVehicleId = (value?: string) => updateSearch({ vehicle: value });
  const setCurrency = (value: string) => updateSearch({ currency: value });
  const setRange = (value: [dayjs.Dayjs, dayjs.Dayjs]) =>
    updateSearch({
      from: value[0].format('YYYY-MM-DD'),
      to: value[1].format('YYYY-MM-DD'),
    });
  const [editor, setEditor] = useState<{
    kind: 'vehicles' | 'records';
    item?: Vehicle | FuelRow;
    values: Record<string, unknown>;
  }>();
  const [recordDraft, setRecordDraft] = useState<Record<string, unknown>>();
  const [costFuelId, setCostFuelId] = useState<string>();
  const [saveKey, setSaveKey] = useState(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [form] = Form.useForm();
  const historicalBackfill = Form.useWatch('historicalBackfill', form);
  const entryVehicleId = Form.useWatch('vehicleId', form);
  const entryLitres = Form.useWatch('litres', form);
  const quantityMode = Form.useWatch('quantityMode', form);
  const referenceProvince = Form.useWatch('referenceProvince', form);
  const referenceGrade = Form.useWatch('referenceGrade', form) || '92';
  const formCurrency = Form.useWatch('currency', form);
  const referencePrice = priceReference.prices.find(
    (p) => p.province === referenceProvince,
  )?.prices[referenceGrade as '92' | '95' | '98' | '0'];
  const vehicles = useQuery({
    queryKey: ['fuel', 'vehicles'],
    queryFn: fuelApi.vehicles,
  });
  const params = {
    vehicleId,
    from: range[0].format('YYYY-MM-DD'),
    to: range[1].format('YYYY-MM-DD'),
    currency,
  };
  const report = useQuery({
    queryKey: ['fuel', 'report', params],
    queryFn: () => fuelApi.report(params),
  });
  const data = report.data;
  const names = vehicles.data ?? [];
  const activeNames = names.filter((v) => v.status !== 'Archived');
  const filters = useMemo(() => fuelRecordFilters(search), [search]);
  const [queryDraft, setQueryDraft] = useState(filters.query);
  const [recordPage, setRecordPage] = useState(1);
  const [selectedRows, setSelectedRows] = useState<FuelRow[]>([]);
  const filterKey = JSON.stringify(filters);
  const filteredRows = useMemo(
    () => filterFuelRecords(data?.records ?? [], names, data?.quality, filters),
    [data, names, filters],
  );
  const recordView = tab === 'records' || tab === 'analysis';
  const exportRows = recordView ? filteredRows : (data?.records ?? []);
  useEffect(() => {
    setQueryDraft(filters.query);
  }, [filters.query]);
  useEffect(() => {
    if (queryDraft.trim() === filters.query) return;
    const timer = setTimeout(
      () => updateSearch({ q: queryDraft.trim() || undefined }, true),
      300,
    );
    return () => clearTimeout(timer);
  }, [queryDraft, filters.query, updateSearch]);
  useEffect(
    () => setRecordPage(1),
    [filterKey, filteredRows.length, vehicleId, params.from, params.to],
  );
  const reload = () => cache.invalidateQueries({ queryKey: ['fuel'] });
  useEffect(
    () => setSelectedRows([]),
    [filterKey, vehicleId, params.from, params.to, tab, hidden],
  );
  function open(kind: 'vehicles' | 'records', item?: Vehicle | FuelRow) {
    const values = item
      ? {
          ...item,
          ...('date' in item
            ? {
                date: dayjs(item.date),
                occurredTime: item.occurredTime
                  ? dayjs(item.date + 'T' + item.occurredTime)
                  : null,
                fuelGrade: item.fuelGrade ?? 'Unknown',
                historicalBackfill: item.odometer === null,
                quantityMode:
                  item.quantitySource && item.quantitySource !== 'Manual'
                    ? 'price'
                    : 'manual',
                quantitySource: item.quantitySource || 'Manual',
                referenceGrade: '92',
              }
            : {
                purchaseDate: item.purchaseDate
                  ? dayjs(item.purchaseDate)
                  : null,
                energyType: item.energyType ?? 'Unknown',
                status: item.status ?? 'Active',
              }),
        }
      : kind === 'vehicles'
        ? { fuelType: 'Petrol', energyType: 'Unknown', status: 'Active' }
        : {
            date: dayjs(),
            historicalBackfill: false,
            vehicleId: vehicleId ?? activeNames[0]?.id,
            currency,
            fullTank: false,
            tankStatus: 'Unknown',
            missedFill: false,
            fuelGrade: 'Unknown',
            station: '',
            note: '',
          };
    if (kind === 'records' && !item) {
      const latest = data?.records.find(
        (r) => r.vehicleId === values.vehicleId,
      );
      if (latest)
        Object.assign(values, {
          fuelGrade: latest.fuelGrade ?? 'Unknown',
          station: latest.station,
        });
    }
    setSaveKey(crypto.randomUUID());
    setEditor({ kind, item, values });
  }
  useEffect(() => {
    if (editor) {
      form.resetFields();
      form.setFieldsValue(editor.values);
    }
  }, [editor, form]);
  async function save() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await fuelApi.save(
        editor!.kind,
        editor!.kind === 'records'
          ? {
              vehicleId: values.vehicleId,
              currency: values.currency,
              litres: values.litres,
              amount: values.amount,
              enteredUnitPrice:
                values.quantityMode === 'price'
                  ? values.enteredUnitPrice
                  : null,
              quantitySource:
                values.quantityMode === 'price'
                  ? values.quantitySource === 'ReferenceSnapshot20261016'
                    ? 'ReferenceSnapshot20261016'
                    : 'Calculated'
                  : 'Manual',
              historicalBackfill: !!values.historicalBackfill,
              date: values.date.format('YYYY-MM-DD'),
              odometer: values.odometer ?? null,
              receipt: values.receipt ?? null,
              occurredTime: values.occurredTime?.format('HH:mm:ss') ?? null,
              odometerReset: !!values.odometerReset,
              postedUnitPrice: values.postedUnitPrice ?? null,
              originalAmount: values.originalAmount ?? null,
              discount: values.discount ?? null,
              pointsRedemption: values.pointsRedemption ?? null,
              paymentMethod: values.paymentMethod ?? null,
              drivingScene: values.drivingScene ?? null,
              station: values.station ?? '',
              fuelGrade: values.fuelGrade ?? 'Unknown',
              note: values.note ?? '',
              fullTank: values.tankStatus === 'Full',
              tankStatus: values.tankStatus ?? 'Unknown',
              missedFill: !!values.missedFill,
            }
          : {
              ...values,
              plate: values.plate ?? '',
              purchaseDate: values.purchaseDate?.format('YYYY-MM-DD') ?? null,
              purchaseCurrency: values.purchaseCurrency ?? null,
            },
        editor!.item,
        saveKey,
      );
      if (editor?.kind === 'records' && !editor.item) setRecordDraft(undefined);
      setEditor(undefined);
      await reload();
      void message.success(tr('已保存', 'Saved'));
    } finally {
      setSaving(false);
    }
  }
  async function archive(vehicle: Vehicle) {
    setSaving(true);
    try {
      await fuelApi.save(
        'vehicles',
        {
          ...vehicle,
          status: vehicle.status === 'Archived' ? 'Active' : 'Archived',
        },
        vehicle,
      );
      await reload();
      void message.success(
        tr(
          '车辆状态已更新，历史记录保留',
          'Vehicle status updated; history retained',
        ),
      );
    } catch (error) {
      if (error instanceof Error) void message.error(error.message);
    } finally {
      setSaving(false);
    }
  }
  function remove(kind: 'vehicles' | 'records', item: Vehicle | FuelRow) {
    const confirmation = modal.confirm({
      title: tr('确认删除？', 'Delete this record?'),
      content: tr(
        '加油记录移入回收站，可恢复，不删除财务流水；油耗将重新计算。车辆有记录（含回收站）时不能删除。',
        'Fuel records move to recoverable trash without deleting ledger transactions; consumption recalculates. Vehicles with records, including trash, cannot be deleted.',
      ),
      onOk: async () => {
        try {
          await fuelApi.remove(kind, item);
          if (kind === 'vehicles' && vehicleId === item.id)
            setVehicleId(undefined);
          await reload();
        } catch (error) {
          const messageText =
            error &&
            typeof error === 'object' &&
            'message' in error &&
            typeof error.message === 'string'
              ? error.message
              : tr('删除失败，请重试', 'Deletion failed. Please retry.');
          void message.error(messageText);
          throw error;
        }
      },
    });
    // Await mode keeps a rejected action open without an unhandled rejection.
    void confirmation.then(
      () => undefined,
      () => undefined,
    );
  }
  function download() {
    if (hidden || !data) return;
    const url = URL.createObjectURL(
      new Blob([fuelCsv(exportRows, names, en)], {
        type: 'text/csv;charset=utf-8',
      }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `fuel-${params.from}-${params.to}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const show = (v: unknown) => (hidden ? '••••' : String(v ?? '—'));
  return (
    <section style={{ minWidth: 0 }}>
      <PageTitle>{tr('车辆能源中心', 'Vehicle energy center')}</PageTitle>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          aria-label={tr('选择车辆', 'Vehicle')}
          placeholder={tr('全部车辆', 'All vehicles')}
          allowClear
          style={{ width: 180 }}
          value={vehicleId}
          onChange={setVehicleId}
          options={names.map((v) => ({
            value: v.id,
            label: hidden
              ? tr('车辆', 'Vehicle')
              : [
                  v.name,
                  v.brand,
                  v.model,
                  v.plate,
                  energyLabels[v.energyType ?? 'Unknown']?.[en ? 1 : 0],
                  v.latestRecordedOdometer != null
                    ? `${v.latestRecordedOdometer} km`
                    : null,
                  v.status === 'Archived' ? tr('已归档', 'Archived') : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
          }))}
        />
        <DatePicker.RangePicker
          aria-label={tr('统计日期', 'Report dates')}
          value={range}
          allowClear={false}
          onChange={(v) => {
            if (v?.[0] && v[1]) setRange([v[0], v[1]]);
          }}
          style={{ maxWidth: '100%' }}
        />
        <Select
          aria-label={tr('统计币种', 'Report currency')}
          value={currency}
          onChange={setCurrency}
          options={CURRENCY_CODES.map((value) => ({ value, label: value }))}
        />
        <Button onClick={() => open('vehicles')}>
          {tr('添加车辆', 'Add vehicle')}
        </Button>
        <Button
          type="primary"
          disabled={
            !activeNames.length ||
            vehicles.isLoading ||
            names.find((v) => v.id === vehicleId)?.status === 'Archived'
          }
          onClick={() => open('records')}
        >
          {tr('记录加油', 'Add fill')}
        </Button>
        <Button
          disabled={
            hidden ||
            !exportRows.length ||
            (recordView && queryDraft.trim() !== filters.query)
          }
          onClick={download}
        >
          {tr('导出 CSV', 'Export CSV')}
        </Button>
      </Space>
      <Button
        style={{ marginBottom: 16 }}
        disabled={hidden || !activeNames.length}
        onClick={() => setImportOpen(true)}
      >
        {tr('导入历史 CSV', 'Import history CSV')}
      </Button>
      <FuelImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={reload}
        vehicles={names}
        english={en}
        hidden={hidden}
      />
      <Tabs
        activeKey={tab}
        onChange={(value) => updateSearch({ tab: value })}
        items={[
          { key: 'overview', label: tr('总览仪表盘', 'Overview') },
          { key: 'records', label: tr('加油记录', 'Fuel records') },
          { key: 'analysis', label: tr('油耗分析', 'Consumption analysis') },
          { key: 'prices', label: tr('油价与加油站', 'Prices & stations') },
          { key: 'costs', label: tr('用车成本', 'Vehicle costs') },
          { key: 'ai', label: tr('AI智能分析', 'AI analysis') },
          { key: 'vehicles', label: tr('车辆档案', 'Vehicles') },
        ]}
      />
      {(vehicles.isError || report.isError) && (
        <ErrorState
          error={vehicles.error ?? report.error}
          retry={() => {
            void vehicles.refetch();
            void report.refetch();
          }}
        />
      )}
      {(vehicles.isLoading || report.isLoading) && <Skeleton active />}
      {!vehicles.isLoading && !names.length && (
        <Empty
          description={tr(
            '先添加一辆车，开始记录加油',
            'Add a vehicle to start tracking fuel',
          )}
        />
      )}
      {recordDraft && !hidden && (
        <Button
          onClick={() => {
            setSaveKey(crypto.randomUUID());
            setEditor({ kind: 'records', values: recordDraft });
          }}
        >
          {tr('恢复未保存草稿', 'Restore unsaved draft')}
        </Button>
      )}
      <Suspense fallback={<Skeleton active />}>
        {tab === 'overview' && data && (
          <FuelOverviewPanel
            report={data}
            vehicles={names}
            vehicleId={vehicleId}
            from={params.from}
            to={params.to}
            currency={currency}
            hidden={hidden}
            english={en}
            onCosts={() => updateSearch({ tab: 'costs' })}
          />
        )}
        {tab === 'analysis' && data && (
          <FuelInsightsPanel
            report={data}
            vehicles={names}
            english={en}
            hidden={hidden}
          />
        )}
        {tab === 'analysis' && !hidden && (
          <Collapse
            style={{ marginTop: 16 }}
            items={[
              {
                key: 'value',
                label: tr(
                  '出行价值比较与费用审批',
                  'Transport value comparison and expense approval',
                ),
                children: (
                  <VehicleValuePanel
                    hidden={hidden}
                    english={en}
                    vehicles={names}
                    vehicleId={vehicleId}
                  />
                ),
              },
              {
                key: 'life',
                label: tr(
                  '车辆更换与出行长期决策',
                  'Vehicle replacement and long-term transport decisions',
                ),
                children: (
                  <VehicleDecisionsPanel hidden={hidden} english={en} />
                ),
              },
            ]}
          />
        )}
        {tab === 'ai' && (
          <FuelAiPanel
            key={JSON.stringify(params)}
            vehicleId={vehicleId}
            from={params.from}
            to={params.to}
            currency={currency}
            hidden={hidden}
            english={en}
          />
        )}
        {tab === 'costs' && (
          <VehiclePlanningPanel
            key={vehicleId ?? 'all'}
            vehicles={names}
            vehicleId={vehicleId}
            from={params.from}
            to={params.to}
            hidden={hidden}
            english={en}
          />
        )}
        {tab === 'costs' && (
          <VehicleCostsPanel
            initialFuelRecordId={costFuelId}
            vehicles={names}
            records={data?.records ?? []}
            vehicleId={vehicleId}
            from={params.from}
            to={params.to}
            hidden={hidden}
            english={en}
          />
        )}
        {tab === 'prices' && <FuelStationsPanel hidden={hidden} english={en} />}
        {tab === 'prices' && <FuelStrategyPanel hidden={hidden} english={en} />}
        {tab === 'analysis' && (
          <FuelStrategyPanel
            key="economy"
            hidden={hidden}
            english={en}
            economy
          />
        )}
      </Suspense>
      {data && tab === 'prices' && (
        <FuelPricesPanel
          groups={data.stationPrices}
          rows={data.records}
          vehicles={names}
          hidden={hidden}
          english={en}
          onEdit={(row) => open('records', row)}
        />
      )}
      {data && (
        <>
          {data.quality && (tab === 'records' || tab === 'analysis') && (
            <FuelQualityPanel
              quality={data.quality}
              rows={data.records}
              vehicles={names}
              hidden={hidden}
              english={en}
              onEdit={(row) => open('records', row)}
            />
          )}
          {(tab === 'overview' || tab === 'analysis') && (
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              {[
                [tr('加油次数', 'Fill count'), data.summary.count, ''],
                [tr('加油总量', 'Fuel purchased'), data.summary.litres, 'L'],
                [
                  tr('加油实付', 'Fuel spending'),
                  data.summary.amount,
                  currency,
                ],
                [
                  tr('加权平均油耗', 'Weighted consumption'),
                  data.summary.litresPer100Km,
                  'L/100km',
                ],
              ].map(([label, value, unit]) => (
                <Col xs={24} sm={12} xl={6} key={String(label)}>
                  <Card>
                    <Statistic
                      title={label}
                      value={show(value)}
                      suffix={hidden ? '' : unit}
                    />
                  </Card>
                </Col>
              ))}
            </Row>
          )}
          {(tab === 'overview' || tab === 'analysis') && (
            <Alert
              type="warning"
              style={{ marginBottom: 16 }}
              message={tr(
                '油耗采用满箱法：两次加满之间全部加油量 ÷ 行驶里程 × 100。首次加满仅建立基线；未知加满状态、未闭合区间、漏记、异常里程或事件顺序不明不计算油耗。中途未加满记录可缺少里程，两端必须有可靠满箱里程。采用参考价计算的加油量及相关油耗属于估算。',
                'Consumption uses full-to-full intervals: all fuel added between full tanks ÷ distance × 100. The first full tank is a baseline; open or interrupted intervals have no consumption estimate. Partial fills without odometers can contribute between reliable full-tank endpoints; unknown status or ambiguous ordering interrupts the interval. Quantities calculated using reference prices and their consumption figures are estimates.',
              )}
              description={tr(
                `有效区间 ${data.summary.completedIntervals} 个，共 ${show(data.summary.distance)} km。区间按结束日期归入筛选期间，可能包含期间之前的基线和补加记录。金额仅汇总 ${currency}，其他币种记录 ${data.summary.otherCurrencyCount} 条不折算。`,
                `Valid intervals: ${data.summary.completedIntervals}, ${show(data.summary.distance)} km. Intervals are assigned by their end date and may start before the selected period. Spending includes ${currency} only; ${data.summary.otherCurrencyCount} other-currency records are not converted.`,
              )}
            />
          )}
          {tab === 'overview' && !hidden && data.monthly.length > 0 && (
            <Card
              title={tr('每月加油量', 'Monthly fuel purchases')}
              style={{ marginBottom: 16 }}
            >
              <Suspense fallback={<Skeleton active />}>
                <Chart
                  option={{
                    tooltip: { trigger: 'axis' },
                    xAxis: {
                      type: 'category',
                      data: data.monthly.map((x) => x.month),
                    },
                    yAxis: { type: 'value', name: 'L' },
                    series: [
                      { type: 'bar', data: data.monthly.map((x) => x.litres) },
                    ],
                  }}
                />
              </Suspense>
            </Card>
          )}
          {(tab === 'records' || tab === 'analysis') && (
            <Card
              title={
                tab === 'analysis'
                  ? tr('区间计算与数据质量', 'Intervals and data quality')
                  : tr('加油记录', 'Refuelling history')
              }
              style={{ marginBottom: 16 }}
            >
              <FuelRecordFilters
                filters={filters}
                query={queryDraft}
                onQuery={setQueryDraft}
                onChange={updateSearch}
                count={filteredRows.length}
                total={data.records.length}
                english={en}
                hidden={hidden}
                qualityAvailable={!!data.quality}
              />
              <Space wrap style={{ marginBottom: 12 }}>
                <Button
                  disabled={
                    hidden || !filteredRows.length || filteredRows.length > 200
                  }
                  onClick={() => setSelectedRows([...filteredRows])}
                >
                  {tr(
                    '选择全部筛选记录（最多200条）',
                    'Select all filtered records (up to 200)',
                  )}
                </Button>
                <Button
                  disabled={hidden}
                  onClick={() =>
                    updateSearch({
                      trash: search.get('trash') === '1' ? undefined : '1',
                    })
                  }
                >
                  {search.get('trash') === '1'
                    ? tr('收起回收站', 'Hide trash')
                    : tr('查看回收站', 'View trash')}
                </Button>
              </Space>
              <FuelBulkActions
                rows={selectedRows}
                english={en}
                hidden={hidden}
                disabled={
                  hidden ||
                  report.isFetching ||
                  queryDraft.trim() !== filters.query
                }
                onClear={() => setSelectedRows([])}
                onDone={reload}
              />
              {search.get('trash') === '1' && (
                <FuelTrashPanel hidden={hidden} english={en} />
              )}
              <Table<FuelRow>
                rowKey="id"
                size="small"
                dataSource={filteredRows}
                rowSelection={{
                  preserveSelectedRowKeys: true,
                  selectedRowKeys: selectedRows.map((r) => r.id),
                  onChange: (_, rows) => {
                    if (rows.length > 200) {
                      void message.warning(
                        tr('最多选择200条', 'Select up to 200 records'),
                      );
                      return;
                    }
                    setSelectedRows(rows);
                  },
                  getCheckboxProps: () => ({ disabled: hidden }),
                }}
                loading={report.isFetching}
                scroll={{ x: 1100 }}
                pagination={{
                  pageSize: 10,
                  showSizeChanger: false,
                  current: recordPage,
                  onChange: setRecordPage,
                }}
                expandable={{
                  rowExpandable: (r) => !!r.assessment && !hidden,
                  expandedRowRender: (r) =>
                    r.assessment ? (
                      <FuelCalculationDetails
                        assessment={r.assessment}
                        english={en}
                      />
                    ) : null,
                }}
                columns={[
                  { title: tr('日期', 'Date'), dataIndex: 'date' },
                  {
                    title: tr('车辆', 'Vehicle'),
                    render: (_, r) =>
                      show(names.find((v) => v.id === r.vehicleId)?.name),
                  },
                  {
                    title: tr('累计里程 km', 'Odometer km'),
                    render: (_, r) =>
                      hidden
                        ? '••••'
                        : r.odometer === null
                          ? tr('未记录', 'Not recorded')
                          : show(r.odometer),
                  },
                  {
                    title: tr('加油量 L', 'Litres'),
                    render: (_, r) => show(r.litres),
                  },
                  {
                    title: tr('实付金额', 'Paid'),
                    render: (_, r) =>
                      hidden ? '••••' : `${r.amount} ${r.currency}`,
                  },
                  {
                    title: tr('单价 /L', 'Price /L'),
                    render: (_, r) =>
                      hidden
                        ? '••••'
                        : r.unitPrice == null
                          ? '—'
                          : `${r.unitPrice} ${r.currency}`,
                  },
                  {
                    title: tr('状态', 'Status'),
                    render: (_, r) => (
                      <Space>
                        {r.tankStatus === 'Full' ? (
                          <Tag color="green">{tr('加满', 'Full')}</Tag>
                        ) : (
                          <Tag>
                            {r.tankStatus === 'Partial'
                              ? tr('未加满', 'Partial')
                              : tr('未知 · 请确认', 'Unknown')}
                          </Tag>
                        )}
                        {r.quantitySource === 'Calculated' && (
                          <Tag>{tr('按单价计算', 'Calculated from price')}</Tag>
                        )}
                        {r.quantitySource === 'ReferenceSnapshot20261016' && (
                          <Tag color="orange">
                            {tr('参考价估算', 'Reference price estimate')}
                          </Tag>
                        )}
                        {r.odometer === null && (
                          <Tag>
                            {tr(
                              '历史补录 · 无里程',
                              'Historical · no odometer',
                            )}
                          </Tag>
                        )}
                        {r.missedFill && (
                          <Tag color="orange">{tr('中间漏记', 'Gap')}</Tag>
                        )}
                      </Space>
                    ),
                  },
                  {
                    title: 'L/100km',
                    render: (_, r) => show(r.interval?.litresPer100Km),
                  },
                  {
                    title: tr('加油站 / 备注', 'Station / note'),
                    render: (_, r) =>
                      show([r.station, r.note].filter(Boolean).join(' · ')),
                  },
                  {
                    title: tr('操作', 'Actions'),
                    fixed: 'right',
                    render: (_, r) => (
                      <Space>
                        <Button size="small" onClick={() => open('records', r)}>
                          {tr('编辑', 'Edit')}
                        </Button>
                        <Button
                          size="small"
                          disabled={hidden}
                          onClick={() => {
                            setCostFuelId(r.id);
                            updateSearch({ tab: 'costs' });
                          }}
                        >
                          {tr('关联财务交易', 'Link ledger transaction')}
                        </Button>
                        <Button
                          size="small"
                          danger
                          onClick={() => remove('records', r)}
                        >
                          {tr('删除', 'Delete')}
                        </Button>
                      </Space>
                    ),
                  },
                ]}
              />
            </Card>
          )}
        </>
      )}
      {tab === 'vehicles' && !!names.length && (
        <Card title={tr('车辆管理', 'Vehicles')}>
          <Row gutter={[12, 12]}>
            {names.map((v) => (
              <Col xs={24} md={12} xl={8} key={v.id}>
                <VehicleProfileCard
                  vehicle={v}
                  hidden={hidden}
                  english={en}
                  busy={saving}
                  onEdit={() => open('vehicles', v)}
                  onArchive={() => void archive(v)}
                  onHistory={() =>
                    updateSearch({ tab: 'records', vehicle: v.id })
                  }
                  onDelete={() => remove('vehicles', v)}
                />
              </Col>
            ))}
          </Row>
        </Card>
      )}
      <Modal
        width={editor?.kind === 'vehicles' ? 820 : undefined}
        title={
          editor?.kind === 'vehicles'
            ? tr('车辆档案', 'Vehicle details')
            : tr('加油记录', 'Refuelling record')
        }
        open={!!editor && !hidden}
        onCancel={() => {
          if (!saving) {
            if (editor?.kind === 'records' && !editor.item) {
              setRecordDraft({
                ...form.getFieldsValue(true),
                receiptReading: false,
              });
              void message.info(
                tr(
                  '未保存草稿已保留在当前页面',
                  'Unsaved draft kept on this page',
                ),
              );
            }
            setEditor(undefined);
          }
        }}
        onOk={() =>
          void save().catch((error) => {
            if (error?.message) void message.error(error.message);
          })
        }
        confirmLoading={saving}
        okText={tr('保存', 'Save')}
        okButtonProps={{ 'aria-label': tr('保存', 'Save') }}
        cancelText={tr('取消', 'Cancel')}
        forceRender
        maskClosable={!saving}
        cancelButtonProps={{ disabled: saving }}
      >
        <Form
          name="fuel-entry"
          form={form}
          layout="vertical"
          preserve={false}
          onValuesChange={(changed, values) => {
            if (editor?.kind !== 'records') return;
            if ('vehicleId' in changed && !editor.item) {
              const recent = data?.records.find(
                (r) => r.vehicleId === values.vehicleId,
              );
              if (recent)
                form.setFieldsValue({
                  fuelGrade: recent.fuelGrade ?? 'Unknown',
                  station: recent.station,
                });
            }
            if (
              'currency' in changed &&
              values.quantitySource === 'ReferenceSnapshot20261016'
            ) {
              form.setFieldsValue({
                enteredUnitPrice: undefined,
                litres: undefined,
                quantitySource: 'Calculated',
              });
              return;
            }
            if (
              values.quantityMode === 'price' &&
              ('amount' in changed ||
                'enteredUnitPrice' in changed ||
                'quantityMode' in changed)
            ) {
              form.setFieldsValue({
                litres: litresFromPrice(values.amount, values.enteredUnitPrice),
                quantitySource:
                  'enteredUnitPrice' in changed || 'quantityMode' in changed
                    ? 'Calculated'
                    : values.quantitySource || 'Calculated',
              });
            }
          }}
        >
          {editor?.kind === 'vehicles' ? (
            <>
              <Form.Item
                name="name"
                label={tr('车辆名称', 'Vehicle name')}
                rules={[{ required: true, whitespace: true }]}
              >
                <Input maxLength={100} />
              </Form.Item>
              <Form.Item
                name="plate"
                label={tr('车牌（选填）', 'Plate (optional)')}
              >
                <Input maxLength={30} />
              </Form.Item>
              <Form.Item
                name="fuelType"
                label={tr('燃料类型', 'Fuel type')}
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { value: 'Petrol', label: tr('汽油', 'Petrol') },
                    { value: 'Diesel', label: tr('柴油', 'Diesel') },
                    { value: 'Hybrid', label: tr('混合动力', 'Hybrid') },
                    { value: 'Electric', label: tr('电能', 'Electric') },
                    { value: 'Other', label: tr('其他', 'Other') },
                  ]}
                />
              </Form.Item>
              <VehicleProfileFields english={en} />
            </>
          ) : (
            <>
              {editor?.kind === 'records' &&
                names.find((v) => v.id === entryVehicleId)?.tankCapacity !=
                  null &&
                entryLitres >
                  names.find((v) => v.id === entryVehicleId)!.tankCapacity! && (
                  <Alert
                    type="warning"
                    showIcon
                    message={tr(
                      '加油量超过车辆档案油箱容量，请核对；特殊情况可在备注解释后保存。',
                      'Quantity exceeds the profile tank capacity. Check the value; exceptional fills can be saved with an explanation in notes.',
                    )}
                    style={{ marginBottom: 12 }}
                  />
                )}
              <Form.Item
                name="vehicleId"
                label={tr('车辆', 'Vehicle')}
                rules={[{ required: true }]}
              >
                <Select
                  options={names.map((v) => ({
                    value: v.id,
                    label: v.name,
                    disabled: !editor?.item && v.status === 'Archived',
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="date"
                label={tr('加油日期', 'Fill date')}
                dependencies={['historicalBackfill', 'odometer']}
                rules={[
                  { required: true },
                  ({ getFieldValue }) => ({
                    validator: (_, value) =>
                      getFieldValue('historicalBackfill') &&
                      getFieldValue('odometer') == null &&
                      value &&
                      !value.isBefore(dayjs().startOf('day'))
                        ? Promise.reject(
                            new Error(
                              tr(
                                '无里程的历史补录日期须早于今天',
                                'A backfill without an odometer must be dated before today',
                              ),
                            ),
                          )
                        : Promise.resolve(),
                  }),
                ]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="historicalBackfill" valuePropName="checked">
                <Checkbox>
                  {tr(
                    '历史补录（里程可留空）',
                    'Historical backfill (odometer optional)',
                  )}
                </Checkbox>
              </Form.Item>
              <Form.Item
                name="odometer"
                label={tr('累计里程（km）', 'Odometer (km)')}
                rules={[
                  {
                    required: !historicalBackfill,
                    message: tr(
                      '最近加油请填写累计里程',
                      'Enter the odometer for a recent fill',
                    ),
                  },
                ]}
                extra={
                  historicalBackfill
                    ? tr(
                        '仅补录今天之前的加油记录可留空。无里程记录保留费用和油量；中途未加满记录可计入可靠满箱区间。',
                        'Leave blank only for fills before today. Partial fills without readings can contribute between reliable full-tank endpoints.',
                      )
                    : undefined
                }
              >
                <InputNumber
                  min={0}
                  max={10000000}
                  precision={1}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item
                name="amount"
                label={tr('实付金额', 'Amount paid')}
                rules={[{ required: true }]}
              >
                <InputNumber
                  min={0}
                  max={100000000}
                  precision={2}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item
                name="quantityMode"
                label={tr('加油量录入方式', 'Fuel quantity entry')}
              >
                <Radio.Group
                  options={[
                    {
                      value: 'manual',
                      label: tr('手动填写升数', 'Enter litres'),
                    },
                    {
                      value: 'price',
                      label: tr(
                        '按金额和单价计算',
                        'Calculate from amount and price',
                      ),
                    },
                  ]}
                />
              </Form.Item>
              <Form.Item name="quantitySource" hidden>
                <Input />
              </Form.Item>
              {quantityMode === 'price' && (
                <>
                  <Form.Item
                    name="enteredUnitPrice"
                    label={tr(
                      '每升单价（所选币种/L）',
                      'Unit price (selected currency/L)',
                    )}
                    rules={[
                      {
                        required: true,
                        message: tr('请输入每升单价', 'Enter the unit price'),
                      },
                    ]}
                    extra={tr(
                      '加油量 = 实付金额 ÷ 每升单价，保留3位小数。以小票实际油量为准，也可切换手动填写。',
                      'Litres = amount paid ÷ unit price, rounded to 3 decimals. Use receipt litres when available by switching to manual entry.',
                    )}
                  >
                    <InputNumber
                      min={0.001}
                      max={1000000}
                      precision={3}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                  <Card
                    size="small"
                    title={tr(
                      '附件参考油价（2026-10-16）',
                      'Workbook reference prices (2026-10-16)',
                    )}
                    style={{ marginBottom: 16 }}
                  >
                    <Form.Item
                      name="referenceProvince"
                      label={tr('参考省份', 'Reference province')}
                    >
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder={tr('选择省份', 'Choose a province')}
                        options={priceReference.prices.map((p) => ({
                          value: p.province,
                          label: p.province,
                        }))}
                      />
                    </Form.Item>
                    <Form.Item
                      name="referenceGrade"
                      initialValue="92"
                      label={tr('参考油号', 'Reference fuel grade')}
                    >
                      <Select
                        options={['92', '95', '98', '0'].map((value) => ({
                          value,
                          label:
                            value === '0'
                              ? tr('0号柴油', '0 diesel')
                              : value + tr('号汽油', ' petrol'),
                        }))}
                      />
                    </Form.Item>
                    <p>
                      {referencePrice
                        ? tr('参考单价：', 'Reference price: ') +
                          referencePrice +
                          ' CNY/L'
                        : tr(
                            '请选择省份查看参考单价',
                            'Choose a province to see its reference price',
                          )}
                    </p>
                    <Button
                      disabled={!referencePrice || formCurrency !== 'CNY'}
                      onClick={() => {
                        if (referencePrice)
                          form.setFieldsValue({
                            enteredUnitPrice: referencePrice,
                            quantitySource: 'ReferenceSnapshot20261016',
                            litres: litresFromPrice(
                              form.getFieldValue('amount'),
                              referencePrice,
                            ),
                          });
                      }}
                    >
                      {tr(
                        '采用参考价（估算）',
                        'Use reference price (estimate)',
                      )}
                    </Button>
                    <p className="muted">
                      {tr(
                        '来源：所提供表格“当前油价”页。仅为2026-10-16的人民币参考价，不是历年实际油价；优惠和地区差异可能影响升数，请按小票核实。',
                        'Source: the supplied workbook’s current-price sheet. These are CNY reference prices as of 2026-10-16, not historical actual prices. Discounts and regional differences may affect litres; verify against receipts.',
                      )}
                    </p>
                  </Card>
                </>
              )}
              <Form.Item
                name="litres"
                label={tr('加油量（L）', 'Fuel (L)')}
                rules={[{ required: true }]}
              >
                <InputNumber
                  readOnly={quantityMode === 'price'}
                  placeholder={
                    quantityMode === 'price'
                      ? tr(
                          '填写金额和单价后自动计算',
                          'Enter amount and price to calculate',
                        )
                      : undefined
                  }
                  min={0.001}
                  max={10000}
                  precision={3}
                  style={{ width: '100%' }}
                />
              </Form.Item>

              <Form.Item
                name="currency"
                label={tr('币种', 'Currency')}
                rules={[{ required: true }]}
              >
                <Select
                  options={CURRENCY_CODES.map((value) => ({
                    value,
                    label: value,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="tankStatus"
                label={tr('加满状态', 'Tank status')}
              >
                <Select
                  options={[
                    { value: 'Unknown', label: tr('未知', 'Unknown') },
                    { value: 'Full', label: tr('确认加满', 'Confirmed full') },
                    { value: 'Partial', label: tr('未加满', 'Partial') },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="fuelGrade"
                label={tr(
                  '油品（未知时请保留未知）',
                  'Fuel grade (leave unknown if unconfirmed)',
                )}
              >
                <Select
                  options={fuelGradeOptions.map((g) => ({
                    value: g.value,
                    label: en ? g.en : g.zh,
                  }))}
                />
              </Form.Item>
              <Form.Item name="missedFill" valuePropName="checked">
                <Checkbox>
                  {tr(
                    '自上次记录后有漏记加油（重置油耗基线）',
                    'A fill was missed since the last record (reset baseline)',
                  )}
                </Checkbox>
              </Form.Item>
              <Form.Item
                name="station"
                label={tr('加油站（选填）', 'Station (optional)')}
              >
                <Input maxLength={200} />
              </Form.Item>
              <FuelDiscountFields english={en} />
              {!hidden && editor && (
                <FuelReceiptFields
                  key={saveKey}
                  form={form}
                  id={editor.item?.id}
                  english={en}
                />
              )}
              <Form.Item
                name="note"
                label={tr('备注（选填）', 'Note (optional)')}
              >
                <Input.TextArea maxLength={1000} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </section>
  );
}
