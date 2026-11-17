import { render, screen } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { TransactionDrawer } from '../features/transactions/TransactionDrawer';
vi.mock('../api/finance', () => ({transactionApi: {detail: vi.fn()}, accountApi: {list: async()=>[]}, categoryApi: {list: async()=>[]}}));
vi.mock('../api/promotions', () => ({promotionsApi: {transaction: async()=>({cashbacks:[],usages:[]})}}));
vi.mock('../features/transactions/TransactionIntegrityPanel', () => ({TransactionIntegrityPanel: ()=> <div>integrity-panel</div>}));
vi.mock('../features/transactions/TransactionHistory', () => ({TransactionHistory: ()=> <div>history-panel</div>}));
vi.mock('../features/attachments/AttachmentsPanel', () => ({AttachmentsPanel: ()=>null}));
vi.mock('../features/transactions/QuickEntry', () => ({QuickEntry: ()=>null}));
it('keeps one integrity panel when switching repeatedly between cached details', () => {
 const cache=new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}});
 for(const id of ['a','b'])cache.setQueryData(['transactions',id],{id,type:'Expense',amount:'1.00',fee:'0.00',refundedAmount:'0.00',currency:'CNY',accountId:'cash',occurredAt:'2026-10-23',createdAt:'2026-10-23T00:00:00Z',updatedAt:'2026-10-23T00:00:00Z',status:'Confirmed',version:'1',entries:[],splits:[],relatedTransactions:[],tagNames:[]});
 const draw=(id:string)=><QueryClientProvider client={cache}><MemoryRouter><App><TransactionDrawer id={id} onClose={()=>{}}/></App></MemoryRouter></QueryClientProvider>;
 const view=render(draw('a'));
 for(const id of ['b','a','b','a','b']){view.rerender(draw(id));expect(screen.getAllByText('integrity-panel')).toHaveLength(1);expect(screen.getAllByText('history-panel')).toHaveLength(1);}
 view.unmount();cache.clear();
});
