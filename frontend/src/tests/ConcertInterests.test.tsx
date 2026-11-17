import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor, within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { App } from 'antd';
import { InterestPanel } from '../features/concerts/InterestPanel';
import { interestApi } from '../features/concerts/interestApi';
import { concertApi } from '../features/concerts/api';
import { useUI } from '../stores/ui';
vi.mock('../features/concerts/interestApi', () => ({
  interestApi: {
    catalog: vi.fn(),
    purchases: vi.fn(),
    report: vi.fn(),
    save: vi.fn(), topicHistory: vi.fn(),
  },
}));
vi.mock('../features/concerts/api', () => ({
  concertApi: { list: vi.fn(), transactions: vi.fn() },
}));
beforeEach(() => {
  vi.clearAllMocks();
  useUI.setState({ hidden: false });
  vi.mocked(interestApi.catalog).mockResolvedValue({
    topics: [],
    links: [],
    budgets: [],
  });
  vi.mocked(interestApi.purchases).mockResolvedValue({ total: 0, items: [] });
  vi.mocked(concertApi.list).mockResolvedValue([]);
  vi.mocked(concertApi.transactions).mockResolvedValue([]);
});
afterEach(cleanup);
function show(section: 'daily' | 'catalog' | 'collection' | 'analysis') {
  return render(
    <App>
      <MemoryRouter>
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { queries: { retry: false } } })
          }
        >
          <InterestPanel section={section} />
        </QueryClientProvider>
      </MemoryRouter>
    </App>,
  );
}
it('daily purchase needs no concert', async () => {
  show('daily');
  fireEvent.click(await screen.findByText('新增购买 / 计划'));
  await waitFor(() =>
    expect(screen.getByText('购买记录 / 计划')).toBeVisible(),
  );
  expect(screen.getByText('场次（可选，仅明确关联）')).toBeVisible();
  expect(screen.queryByLabelText('演唱会名称')).not.toBeInTheDocument();
  expect(
    screen.getByText('付款交易（真实购买必填；实际账户沿用原交易）'),
  ).toBeVisible();
  expect(screen.getByText('计划 / 心愿')).toBeVisible();
});
it('brand can exist independently', async () => {
  show('catalog');
  fireEvent.click(await screen.findByText('新增艺人 / 品牌'));
  await waitFor(() => expect(screen.getByLabelText('名称')).toBeVisible());
  expect(screen.getByLabelText('类型')).toBeInTheDocument();
  fireEvent.mouseDown(
    screen.getByLabelText('类型').closest('.ant-select-selector')!,
  );
  fireEvent.click(
    await screen.findByText('品牌', {
      selector: '.ant-select-item-option-content',
    }),
  );
  fireEvent.change(screen.getByLabelText('名称'), {
    target: { value: 'STAYREAL' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() =>
    expect(interestApi.save).toHaveBeenCalledWith(
      'topics',
      { name: 'STAYREAL', kind: 'Brand', note: '', artistProfile: null },
      undefined,
    ),
  );
});
it('privacy mode hides purchase controls', async () => {
  useUI.setState({ hidden: true });
  show('daily');
  expect(
    await screen.findByText('隐私模式下已隐藏商品与兴趣消费资料'),
  ).toBeVisible();
  expect(screen.queryByText('新增购买 / 计划')).not.toBeInTheDocument();
});
import { prepareOperation, pendingOperations, completeOperation } from '../stores/operationJournal';
it.each(['/concerts/interests/purchases','/concerts/interests/topics','/concerts/interests/links','/concerts/interests/budgets','/concerts/interests/batch-link','/concerts/interests/purchases/11111111-1111-4111-8111-111111111111/advice','/concerts/interests/purchases/11111111-1111-4111-8111-111111111111/approval'])('interest submission can recover safely: %s',async(path)=>{const user='music-'+crypto.randomUUID();const request={key:crypto.randomUUID(),method:'post',path,body:{test:true},version:'0'};const a=await prepareOperation(user,request);const b=await prepareOperation(user,{...request,key:crypto.randomUUID()});expect(a.operation.key).toBe(b.operation.key);expect(pendingOperations(user)).toHaveLength(1);completeOperation(user,a.operation.key);expect(pendingOperations(user)).toHaveLength(0);});

it('saves aliases and dated band membership without a transaction', async () => {
  vi.mocked(interestApi.catalog).mockResolvedValue({ topics: [{ id: 'member-1', version: '1', input: { name: '成员甲', kind: 'Artist', note: '', artistProfile: { type: 'Solo', aliases: [], members: [] } } }], links: [], budgets: [] });
  vi.mocked(interestApi.save).mockResolvedValue({} as never);
  show('catalog');
  fireEvent.click(await screen.findByText('新增艺人 / 品牌'));
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '新组合' } });
  fireEvent.mouseDown(screen.getByLabelText('艺人类别').closest('.ant-select-selector')!);
  fireEvent.click(await screen.findByText('乐队 / 组合', { selector: '.ant-select-item-option-content' }));
  fireEvent.change(screen.getByLabelText('别名'), { target: { value: 'Example Alias' } });
  fireEvent.keyDown(screen.getByLabelText('别名'), { key: 'Enter', keyCode: 13 });
  fireEvent.click(await screen.findByRole('button', { name: '添加成员关系' }));
  fireEvent.mouseDown(screen.getByLabelText('成员艺人').closest('.ant-select-selector')!);
  fireEvent.click(await screen.findByText('成员甲', { selector: '.ant-select-item-option-content' }));
  fireEvent.change(screen.getByLabelText('成员角色'), { target: { value: '主唱' } });
  fireEvent.change(screen.getByLabelText('加入日期'), { target: { value: '2000-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'OK' }));
  await waitFor(() => expect(interestApi.save).toHaveBeenCalledWith('topics', expect.objectContaining({ name: '新组合', artistProfile: { type: 'Band', aliases: ['Example Alias'], members: [{ artistId: 'member-1', role: '主唱', joinedOn: '2000-01-01', leftOn: null }] } }), undefined));
});
it('searches artist aliases and displays membership changes from history', async () => {
  const band = { id: 'band-1', version: '2', input: { name: '组合甲', kind: 'Artist', note: '', artistProfile: { type: 'Band' as const, aliases: ['别称甲'], members: [] } } };
  vi.mocked(interestApi.catalog).mockResolvedValue({ topics: [band, { id: 'person-1', version: '1', input: { name: '成员甲', kind: 'Artist', note: '' } }, { id: 'brand-1', version: '1', input: { name: '无关品牌', kind: 'Brand', note: '' } }], links: [], budgets: [] });
  vi.mocked(interestApi.topicHistory).mockResolvedValue([{ id: 'history-1', createdAt: '2026-11-01T00:00:00Z', before: { ...band.input, note: '关系移除前', artistProfile: { ...band.input.artistProfile, members: [{ artistId: 'person-1', role: '吉他', joinedOn: '2000-01-01', leftOn: '2020-01-01' }] } }, after: band.input }]);
  show('catalog');
  await screen.findByText('组合甲');
  fireEvent.change(screen.getByLabelText('搜索艺人名称或别名'), { target: { value: '别称甲' } });
  expect(screen.getByText('组合甲')).toBeVisible();
  expect(screen.queryByText('无关品牌')).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByText('组合甲').closest('tr')!).getByRole('button', { name: '修改历史' }));
  expect(await screen.findByText('备注：关系移除前')).toBeVisible();
  expect(screen.getByText('成员：成员甲 · 吉他 · 2000-01-01 — 2020-01-01')).toBeVisible();
  expect(interestApi.topicHistory).toHaveBeenCalledWith('band-1');
});
