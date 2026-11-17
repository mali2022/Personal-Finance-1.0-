import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import ConcertsPage from '../pages/ConcertsPage';
import { ModuleSettings } from '../features/concerts/ModuleSettings';
import { TourReport } from '../features/concerts/TourReport';
import { TourPanel } from '../features/concerts/TourPanel';
import { DataEditor, SceneEditor } from '../features/concerts/ConcertForms';
import { concertApi } from '../features/concerts/api';
import { interestApi } from '../features/concerts/interestApi';
import { useUI } from '../stores/ui';
import { activeNavigation } from '../design/navigation';
import { ConcertClosingPanel } from '../features/concerts/ConcertClosingPanel';
vi.mock('../features/concerts/interestApi', () => ({ interestApi: { catalog: vi.fn() } }));
vi.mock('../features/concerts/api', () => ({
  concertApi: {
    modules: vi.fn(),
    setModules: vi.fn(), save: vi.fn(),
    list: vi.fn(),
    annual: vi.fn(), tours: vi.fn(), saveTour: vi.fn(), tourReport: vi.fn(), transferTransactions: vi.fn(),
  },
}));
vi.mock('../features/concerts/ConcertDetail', () => ({ ConcertDetail: ({ id }: { id: string }) => <div>场次明细目标：{id}</div> }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(concertApi.transferTransactions).mockResolvedValue([]);
  vi.mocked(interestApi.catalog).mockResolvedValue({ topics: [], links: [], budgets: [] });
  useUI.setState({ hidden: false, language: 'zh-CN' });
  vi.mocked(concertApi.modules).mockResolvedValue({
    concerts: false,
    version: '0',
  });
});
afterEach(cleanup);
function show(element: React.ReactNode) {
  return render(
    <App>
      <MemoryRouter>
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          {element}
        </QueryClientProvider>
      </MemoryRouter>
    </App>,
  );
}
it('does not query financial data before the module is enabled', async () => {
  expect(activeNavigation('/concerts')?.group).toBe('special');
  show(<ConcertsPage />);
  expect(
    await screen.findByText('该模块尚未启用，请在设置的可选模块中开启。'),
  ).toBeVisible();
  expect(concertApi.list).not.toHaveBeenCalled();
  expect(concertApi.annual).not.toHaveBeenCalled();
});
it('saves the user module setting with its version and refreshes it', async () => {
  vi.mocked(concertApi.setModules).mockImplementation(async () => {
    vi.mocked(concertApi.modules).mockResolvedValue({
      concerts: true,
      version: '1',
    });
    return {} as never;
  });
  show(<ModuleSettings />);
  const toggle = await screen.findByRole('switch', {
    name: '启用演唱会专项记账',
  });
  await waitFor(() => expect(toggle).not.toBeDisabled());
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(concertApi.setModules).toHaveBeenCalledWith(true, '0'),
  );
  expect(await screen.findByText('进入演唱会档案')).toBeVisible();
});
it('keeps entered money and zero values after version conflicts', async () => {
  const save = vi.fn().mockRejectedValue({ message: '数据已更新，请重新加载' });
  show(
    <DataEditor
      title="退款"
      fields={[
        { name: 'amount', label: '到账金额', kind: 'amount', required: true },
        { name: 'fee', label: '费用', kind: 'amount' },
      ]}
      value={{ amount: '10', fee: '5' }}
      onSave={save}
      onClose={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('费用'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  expect(await screen.findByText('数据已更新，请重新加载')).toBeVisible();
  expect(screen.getByDisplayValue('0')).toBeVisible();
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ amount: '10', fee: '0' }),
  );
});
it('submits existing combined payment sources as allocations without creating transactions', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  show(
    <DataEditor
      title="组合付款"
      fields={[
        {
          name: 'paymentParts',
          label: '付款来源',
          kind: 'payments',
          options: [
            { value: 'own', label: '本人支出 40.00' },
            { value: 'advance', label: '原代垫 60.00' },
          ],
        },
      ]}
      value={{
        paymentParts: [
          { transactionId: 'own', amount: '40.00', fee: '2.00' },
          { transactionId: 'advance', amount: '60.00', fee: '0.00' },
        ],
      }}
      onSave={save}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByLabelText('该来源归属金额 1')).toHaveValue('40.00');
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentParts: [
          { transactionId: 'own', amount: '40.00', fee: '2.00' },
          { transactionId: 'advance', amount: '60.00', fee: '0.00' },
        ],
      }),
    ),
  );
});

it('edits individual tickets without changing order payment fields', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  show(<DataEditor title="逐张门票" fields={[{ name: 'tickets', label: '门票档案', kind: 'tickets' }]} value={{ paidAmount: '180.00', tickets: [] }} onSave={save} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '添加逐张门票' }));
  fireEvent.change(screen.getByLabelText('门票 1 座位'), { target: { value: '2排3座' } });
  fireEvent.change(screen.getByLabelText('门票 1 观演人'), { target: { value: '同行人' } });
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ paidAmount: '180.00', tickets: [expect.objectContaining({ seat: '2排3座', attendee: '同行人', state: 'Pending', format: 'Electronic' })] })));
});

it('creates an independent tour without requiring any scenes', async () => {
  vi.mocked(concertApi.tours).mockResolvedValue([]);
  vi.mocked(concertApi.saveTour).mockResolvedValue({} as never);
  show(<TourPanel />);
  fireEvent.click(await screen.findByRole('button', { name: '新增巡演' }));
  fireEvent.change(screen.getByLabelText('巡演名称'), { target: { value: '独立巡演' } });
  fireEvent.change(screen.getByLabelText('艺人名称'), { target: { value: '乐队' } });
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  await waitFor(() => expect(concertApi.saveTour).toHaveBeenCalledWith(expect.objectContaining({ name: '独立巡演', artist: '乐队', startsOn: null, endsOn: null, state: 'Planned' }), undefined));
});

it('shows separate currency totals and drills into the selected scene', async () => {
  vi.mocked(concertApi.tourReport).mockResolvedValue({ id: 'tour', input: { name: '测试巡演', artist: '乐队' }, rule: '按原币分别汇总，计划不计入已发生费用', currencies: [
    { currency: 'CNY', count: 2, attended: 0, totalBudget: '2000', originalCosts: '100', confirmedRefunds: '20', actual: '80', personalNetCost: '80', pendingAdvances: '0', planned: '10', remaining: '1920' },
    { currency: 'USD', count: 1, attended: 0, totalBudget: '1000', originalCosts: '30', confirmedRefunds: '0', actual: '30', personalNetCost: '30', pendingAdvances: '0', planned: '0', remaining: '970' },
  ], scenes: [{ id: 'scene-1', input: { title: '上海场', city: '上海', currency: 'CNY' }, report: { actual: '80', personalNetCost: '80', pendingAdvances: '0', warnings: ['请核对原交易'] } }] } as never);
  show(<TourReport id="tour" onClose={vi.fn()} />);
  expect(await screen.findByText('测试巡演 · 乐队')).toBeVisible();
  expect(screen.getAllByText('CNY').length).toBeGreaterThan(0);
  expect(screen.getByText('USD')).toBeVisible();
  expect(screen.getByText('请核对原交易')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '查看场次明细' }));
  expect(screen.getByText('场次明细目标：scene-1')).toBeVisible();
  expect(concertApi.tourReport).toHaveBeenCalledWith('tour');
});

it('changes the scene timezone without moving the saved instant', async () => {
  vi.mocked(concertApi.tours).mockResolvedValue([]);
  vi.mocked(concertApi.save).mockResolvedValue({} as never);
  const scene = { id: 'scene-time', version: '1', input: { artist: '乐队', tourName: '', tourId: null, title: '纽约场', startsAt: '2026-01-01T02:30:00Z', timeZone: 'America/New_York', city: '纽约', venue: '场馆', sessionNumber: '', organizer: '', platform: '', currency: 'CNY', totalBudget: '0.00', expectedPeople: 1, actualPeople: 0, note: '', state: 'Planning', attachmentIds: [], budgets: [], orders: [], costs: [], plans: [], refunds: [], companions: [] } };
  const saved = vi.fn().mockResolvedValue(undefined);
  show(<SceneEditor scene={scene} scenes={[scene]} onClose={vi.fn()} onSaved={saved} />);
  expect(screen.getByLabelText('演出当地时区（IANA）')).toHaveValue('America/New_York');
  expect(screen.getByLabelText('开始时间（当前设备时区）')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('演出当地时区（IANA）'), { target: { value: 'Asia/Shanghai' } });
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  await waitFor(() => expect(concertApi.save).toHaveBeenCalled());
  const payload = vi.mocked(concertApi.save).mock.calls[0][0];
  expect(payload.timeZone).toBe('Asia/Shanghai');
  expect(Date.parse(payload.startsAt)).toBe(Date.parse(scene.input.startsAt));
});

it.each(['artist-one', '__none__'])('saves an explicit primary artist choice %s', async choice => {
  vi.mocked(concertApi.tours).mockResolvedValue([]);
  vi.mocked(concertApi.save).mockResolvedValue({} as never);
  vi.mocked(interestApi.catalog).mockResolvedValue({ topics: [
    { id: 'artist-one', version: '1', input: { name: '乐队档案', kind: 'Artist', note: '' } },
    { id: 'brand-one', version: '1', input: { name: '品牌档案', kind: 'Brand', note: '' } },
  ], links: [], budgets: [] });
  const scene = { id: 'scene-artist', version: '1', input: { artist: '乐队', tourName: '', tourId: null, title: '演出', startsAt: '2026-01-01T02:30:00Z', timeZone: 'Asia/Shanghai', artistLink: { artistId: 'artist-old' }, city: '上海', venue: '场馆', sessionNumber: '', organizer: '', platform: '', currency: 'CNY', totalBudget: '0.00', expectedPeople: 1, actualPeople: 0, note: '', state: 'Planning', attachmentIds: [], budgets: [], orders: [], costs: [], plans: [], refunds: [], companions: [] } };
  show(<SceneEditor scene={scene} scenes={[scene]} onClose={vi.fn()} onSaved={vi.fn().mockResolvedValue(undefined)} />);
  const field = screen.getByLabelText('关联主艺人 / 乐队档案');
  await waitFor(() => expect(field).not.toBeDisabled());
  fireEvent.mouseDown(field);
  fireEvent.click(await screen.findByText(choice === '__none__' ? '不关联艺人档案（保留显示名称）' : '乐队档案'));
  expect(screen.queryByText('品牌档案')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  await waitFor(() => expect(concertApi.save).toHaveBeenCalled());
  const payload = vi.mocked(concertApi.save).mock.calls[0][0];
  expect(payload.artistLink).toEqual({ artistId: choice === '__none__' ? null : 'artist-one' });
  expect(payload).not.toHaveProperty('artistReference');
});

it('saves explicit joint artist ratios while retaining the original payment fields', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  show(<DataEditor title="联合归属" fields={[{ name: 'artistAllocation', label: '联合费用', kind: 'artist-allocation', options: [{ value: 'a', label: '艺人甲' }, { value: 'b', label: '艺人乙' }] }]} value={{ paidAmount: '100.00', artistAllocation: { mode: 'Split', shares: [{ artistId: 'a', ratio: 50 }, { artistId: 'b', ratio: 30 }] } }} onSave={save} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('艺人归属比例 1'), { target: { value: '60' } });
  expect(screen.getByText(/未分配比例 10.00%/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ paidAmount: '100.00', artistAllocation: { mode: 'Split', shares: [{ artistId: 'a', ratio: 60 }, { artistId: 'b', ratio: 30 }] } })));
});
it('explicitly returns from joint allocation to primary artist mode', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  show(<DataEditor title="联合归属" fields={[{ name: 'artistAllocation', label: '联合费用', kind: 'artist-allocation', options: [{ value: 'a', label: '艺人甲' }] }]} value={{ artistAllocation: { mode: 'Split', shares: [{ artistId: 'a', ratio: 50 }] } }} onSave={save} onClose={vi.fn()} />);
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '艺人费用归属模式' }));
  fireEvent.click(await screen.findByText('沿用主艺人 / 历史名称口径', { selector: '.ant-select-item-option-content' }));
  expect(screen.queryByLabelText('艺人归属比例 1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ artistAllocation: { mode: 'Primary', shares: [] } })));
});

it('records a ticket gift without changing payment, attendee or usage state', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const ticket = { id: 'ticket-1', tier: 'A', seat: '1排1座', attendee: '本人', format: 'Electronic', state: 'Received' };
  show(<DataEditor title="门票赠送" fields={[{ name: 'tickets', label: '门票档案', kind: 'tickets' }]} value={{ paidAmount: '100.00', tickets: [ticket] }} onSave={save} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '登记赠送' }));
  fireEvent.change(screen.getByLabelText('门票 1 接收人'), { target: { value: '朋友甲' } });
  fireEvent.change(screen.getByLabelText('门票 1 赠送日期'), { target: { value: '2026-01-02' } });
  fireEvent.click(screen.getByLabelText('我已确认该赠送符合票务平台规则'));
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ paidAmount: '100.00', tickets: [expect.objectContaining({ attendee: '本人', state: 'Received', gift: { from: '本人', recipient: '朋友甲', giftedOn: '2026-01-02', state: 'Given', note: '', platformAllowed: true } })] })));
});
it('blocks incomplete ticket gifts before submission', async () => {
  const save = vi.fn();
  show(<DataEditor title="门票赠送" fields={[{ name: 'tickets', label: '门票档案', kind: 'tickets' }]} value={{ tickets: [{ id: 'ticket-1', tier: '', seat: '', attendee: '本人', format: 'Electronic', state: 'Received' }] }} onSave={save} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '登记赠送' }));
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  expect(await screen.findByText('门票 1：请填写赠送人、接收人和赠送日期')).toBeVisible();
  expect(save).not.toHaveBeenCalled();
});
it('revokes a ticket gift record while retaining its recipient and date', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  show(<DataEditor title="门票赠送" fields={[{ name: 'tickets', label: '门票档案', kind: 'tickets' }]} value={{ tickets: [{ id: 'ticket-1', tier: '', seat: '', attendee: '朋友甲', format: 'Electronic', state: 'Used', gift: { from: '本人', recipient: '朋友甲', giftedOn: '2026-01-02', state: 'Given', note: '', platformAllowed: true } }] }} onSave={save} onClose={vi.fn()} />);
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '门票 1 赠送记录状态' }));
  fireEvent.click(await screen.findByText('赠送记录已撤销', { selector: '.ant-select-item-option-content' }));
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ tickets: [expect.objectContaining({ gift: expect.objectContaining({ state: 'Revoked', recipient: '朋友甲', giftedOn: '2026-01-02' }) })] })));
});

it('links real transfer proceeds without changing the ticket cost or attendee', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  vi.mocked(concertApi.transferTransactions).mockImplementation(async (_currency, kind) => kind === 'Income' ? [{ id: 'receipt-1', type: 'Income', amount: '80.00', currency: 'CNY', note: '买家实际回款', merchant: null }] : []);
  show(<DataEditor title="门票转让" fields={[{ name: 'tickets', label: '门票档案', kind: 'tickets', currency: 'CNY' }]} value={{ paidAmount: '100.00', tickets: [{ id: 'ticket-1', tier: 'A', seat: '1排1座', attendee: '本人', format: 'Electronic', state: 'Received' }] }} onSave={save} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: '登记有偿转让' }));
  fireEvent.change(screen.getByLabelText('转让买家'), { target: { value: '买家甲' } });
  fireEvent.change(screen.getByLabelText('转让日期'), { target: { value: '2026-01-02' } });
  fireEvent.change(screen.getByLabelText('约定票款'), { target: { value: '80.00' } });
  fireEvent.click(screen.getByLabelText('我已确认转让符合票务平台规则'));
  fireEvent.click(screen.getByRole('button', { name: '关联已收票款' }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '已收票款流水 1' }));
  fireEvent.click(await screen.findByText('80.00 CNY · 买家实际回款', { selector: '.ant-select-item-option-content' }));
  fireEvent.change(screen.getByLabelText('已收票款归属金额 1'), { target: { value: '80.00' } });
  expect(screen.getByRole('button', { name: '登记赠送' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ paidAmount: '100.00', tickets: [expect.objectContaining({ attendee: '本人', state: 'Received', transfer: expect.objectContaining({ buyer: '买家甲', agreedAmount: '80.00', receipts: [{ transactionId: 'receipt-1', amount: '80.00' }], returns: [] }) })] })));
  expect(concertApi.transferTransactions).toHaveBeenCalledWith('CNY', 'Income', '');
});

it('blocks incomplete transfer payment links and preserves repayment details when revoking', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  show(<DataEditor title="撤销转让" fields={[{ name: 'tickets', label: '门票档案', kind: 'tickets' }]} value={{ tickets: [{ id: 'ticket-1', tier: '', seat: '', attendee: '本人', format: 'Electronic', state: 'Received', transfer: { seller: '本人', buyer: '买家甲', transferredOn: '2026-01-02', agreedAmount: '80.00', state: 'Recorded', platformAllowed: true, note: '', receipts: [{ transactionId: 'receipt-1', amount: '80.00' }], returns: [{ transactionId: 'return-1', amount: '' }] } }] }} onSave={save} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  expect(await screen.findByText('门票 1：请选择真实资金流水并填写有效归属金额')).toBeVisible();
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('实际返款归属金额 1'), { target: { value: '80.00' } });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '转让记录状态' }));
  fireEvent.click(await screen.findByText('转让记录已撤销（票款须抵平）', { selector: '.ant-select-item-option-content' }));
  fireEvent.click(screen.getByRole('button', { name: /^保存$/ }));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ tickets: [expect.objectContaining({ transfer: expect.objectContaining({ state: 'Revoked', receipts: [{ transactionId: 'receipt-1', amount: '80.00' }], returns: [{ transactionId: 'return-1', amount: '80.00' }] }) })] })));
});
it('records free gift provenance with zero payment and a real received date',async()=>{
 const save=vi.fn().mockResolvedValue(undefined);show(<DataEditor title="获赠票" fields={[{name:'origin',label:'门票来源',kind:'ticket-origin'}]} value={{paidAmount:'0.00',origin:{kind:'Self',from:'',receivedOn:null,note:'',platformAllowed:false}}} onSave={save} onClose={vi.fn()}/>);
 fireEvent.mouseDown(screen.getByRole('combobox',{name:'门票来源类型'}));fireEvent.click(await screen.findByText('免费获赠（零实付，不创建现金流水）',{selector:'.ant-select-item-option-content'}));fireEvent.change(screen.getByLabelText('获赠来源人'),{target:{value:'朋友甲'}});fireEvent.change(screen.getByLabelText('获赠日期'),{target:{value:'2026-01-02'}});fireEvent.click(screen.getByLabelText('我已确认获赠符合票务平台规则'));fireEvent.click(screen.getByRole('button',{name:/^保存$/}));await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({paidAmount:'0.00',origin:expect.objectContaining({kind:'Gift',from:'朋友甲',receivedOn:'2026-01-02',platformAllowed:true})})));
});
it('keeps per-ticket paid and personal allocations explicit when confirming unused status',async()=>{
 const save=vi.fn().mockResolvedValue(undefined);show(<DataEditor title="未使用分配" fields={[{name:'tickets',label:'逐票档案',kind:'tickets'}]} value={{tickets:[{id:'t',tier:'',seat:'',attendee:'本人',format:'Electronic',state:'Received'}]}} onSave={save} onClose={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('门票 1 实付分配'),{target:{value:'100.00'}});fireEvent.change(screen.getByLabelText('门票 1 本人承担分配'),{target:{value:'40.00'}});fireEvent.mouseDown(screen.getByRole('combobox',{name:'门票 1 未使用结果'}));fireEvent.click(await screen.findByText('确认未使用（原成本分项，不重复记账）',{selector:'.ant-select-item-option-content'}));fireEvent.change(screen.getByLabelText('门票 1 未使用说明'),{target:{value:'未到场'}});fireEvent.click(screen.getByRole('button',{name:/^保存$/}));await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({tickets:[expect.objectContaining({paidShare:'100.00',personalShare:'40.00',state:'Received',outcome:{state:'Unused',note:'未到场'}})]})));
});
it('submits closing through the existing scene version and displays insurance separately',async()=>{
 vi.mocked(concertApi.save).mockResolvedValue({} as never);const detail={id:'closing-scene',version:'7',input:{currency:'CNY',orders:[],insurance:[],closing:{state:'Open',closedOn:'2026-01-21',note:'已核对'}},report:{personalNetCost:'100.00',finalPersonalCost:'70.00',unusedBurden:'70.00',insuranceRecovery:{netRecovery:'30.00',rows:[]}}} as never;
 show(<ConcertClosingPanel detail={detail} onSaved={vi.fn().mockResolvedValue(undefined)}/>);expect(screen.getByText('理赔净回收：30.00 CNY')).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'结案 / 核对结案'}));fireEvent.mouseDown(screen.getByLabelText('结案状态'));fireEvent.click(await screen.findByText('确认已核对并结案',{selector:'.ant-select-item-option-content'}));fireEvent.click(screen.getByRole('button',{name:/^保存$/}));await waitFor(()=>expect(concertApi.save).toHaveBeenCalledWith(expect.objectContaining({closing:{state:'Closed',closedOn:'2026-01-21',note:'已核对'}}),detail));
});
