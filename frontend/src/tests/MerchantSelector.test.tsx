import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { MerchantSelector } from '../components/BusinessSelectors';
vi.mock('../hooks/useMobile', () => ({ useMobile: () => true }));
vi.mock('../api/business', () => ({
  directoryApi: {
    list: vi.fn(async () => ({
      items: [{ name: '午餐店', status: 'Active', categoryId: 'food' }],
      total: 1,
    })),
  },
}));
vi.mock('../api/finance', () => ({
  categoryApi: {
    list: async () => [{ id: 'food', kind: 'Expense', status: 'Active' }],
  },
}));
describe('mobile merchant dropdown', () => {
  it('opens like category, selects merchants, and accepts new names', async () => {
    const onChange = vi.fn();
    const recommend = vi.fn();
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MerchantSelector
          onChange={onChange}
          onRecommend={recommend}
          categoryKind="Expense"
        />
      </QueryClientProvider>,
    );
    fireEvent.mouseDown(screen.getByRole('combobox'));
    await screen.findByText('午餐店');
    fireEvent.click(screen.getByText('午餐店'));
    expect(onChange).toHaveBeenCalledWith('午餐店');
    await waitFor(() => expect(recommend).toHaveBeenCalledWith('food'));
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.change(screen.getByLabelText('搜索选项'), {
      target: { value: '新商户' },
    });
    fireEvent.click(await screen.findByText('使用此名称：新商户'));
    expect(onChange).toHaveBeenCalledWith('新商户');
  });
  it('clears an existing merchant', () => {
    const onChange = vi.fn();
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MerchantSelector value="既有商户" onChange={onChange} />
      </QueryClientProvider>,
    );
    const clear = container.querySelector('.ant-select-clear');
    expect(clear).not.toBeNull();
    fireEvent.mouseDown(clear!);
    expect(onChange).toHaveBeenCalledWith('');
  });
});
