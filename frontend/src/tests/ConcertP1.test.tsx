import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {App} from 'antd';
import {apiClient} from '../api/client';
import {TripPanel} from '../features/concerts/TripPanel';
import {ExperiencePanel} from '../features/concerts/ExperiencePanel';
import {P1FinancePanel} from '../features/concerts/P1FinancePanel';
import {useUI} from '../stores/ui';
vi.mock('../api/client',()=>({apiClient:{get:vi.fn(),request:vi.fn()}}));
const response=(data:unknown)=>({data:{data}});
beforeEach(()=>{vi.clearAllMocks();useUI.setState({hidden:false,language:'zh-CN'});vi.mocked(apiClient.get).mockImplementation(async(path)=>response(String(path).includes('planning-sources')?{goals:[],holds:[],prepayments:[]}:String(path).endsWith('/catalog')?{topics:[],links:[],budgets:[]}:[]) as never);vi.mocked(apiClient.request).mockResolvedValue({} as never);});afterEach(cleanup);
function show(element:React.ReactNode){return render(<App><MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{element}</QueryClientProvider></MemoryRouter></App>);}
it('keeps shared itinerary money and version after a failed write',async()=>{
 const input={name:'联合旅行',currency:'CNY',budget:'200.00',state:'Booked',sceneIds:[],stops:[],expenses:[{id:'e',transactionId:'tx',amount:'100.00',allocations:[]}],note:''};vi.mocked(apiClient.get).mockImplementation(async(path)=>response(path==='/concerts/trips'?[{id:'trip',version:'7',input,report:{occurred:'100.00',unassigned:'100.00',warnings:[]}}]:[]) as never);vi.mocked(apiClient.request).mockRejectedValue(new Error('版本冲突，请重新加载'));
 show(<TripPanel scenes={[]}/>);fireEvent.click(await screen.findByRole('button',{name:'管理行程'}));fireEvent.change(screen.getByLabelText('行程名称'),{target:{value:'上海联合旅行'}});fireEvent.click(screen.getByRole('button',{name:'保存行程'}));expect(await screen.findByText('版本冲突，请重新加载')).toBeVisible();expect(screen.getByLabelText('行程名称')).toHaveValue('上海联合旅行');expect(screen.getByLabelText('本行程归属金额')).toHaveValue('100.00');expect(apiClient.request).toHaveBeenCalledWith(expect.objectContaining({method:'put',data:expect.objectContaining({expenses:input.expenses}),headers:expect.objectContaining({'If-Match':'7'})}));
});
it('creates venue metadata without a financial write',async()=>{
 show(<ExperiencePanel scenes={[]}/>);fireEvent.click(await screen.findByRole('button',{name:'新增场馆档案'}));fireEvent.change(screen.getByLabelText('场馆名称'),{target:{value:'体育馆'}});fireEvent.change(screen.getByLabelText('城市'),{target:{value:'上海'}});fireEvent.click(screen.getByRole('button',{name:/^保存$/}));await waitFor(()=>expect(apiClient.request).toHaveBeenCalledWith(expect.objectContaining({url:'/concerts/experiences/venues',data:expect.objectContaining({name:'体育馆',city:'上海'})})));expect(vi.mocked(apiClient.request).mock.calls.every(([r])=>!String(r.url).startsWith('/transactions'))).toBe(true);
});
it('preserves decimal strings in a scoped budget and links no money automatically',async()=>{
 show(<P1FinancePanel/>);fireEvent.click(screen.getByRole('tab',{name:'专项预算与储蓄'}));fireEvent.click(screen.getByRole('button',{name:'新增专项预算'}));fireEvent.change(screen.getByLabelText('名称'),{target:{value:'年度音乐预算'}});fireEvent.change(screen.getByLabelText('分析预算上限'),{target:{value:'1000.01'}});fireEvent.change(screen.getByLabelText('假设单场新增费用（用于可承受场次估算）'),{target:{value:'300.00'}});fireEvent.click(screen.getByRole('button',{name:/^保存$/}));await waitFor(()=>expect(apiClient.request).toHaveBeenCalledWith(expect.objectContaining({url:'/concerts/planning-budgets',data:expect.objectContaining({amount:'1000.01',assumedPerShow:'300.00',scope:'Annual',goalId:null,holdId:null})})));
});
