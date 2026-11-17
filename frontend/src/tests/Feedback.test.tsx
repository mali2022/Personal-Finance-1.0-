import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErrorState } from '../components/Feedback';
describe('错误详情', () => {
  it('默认展示中文摘要，展开可见请求编号与纯文本校验详情', async () => {
    const { container } = render(
      <ErrorState
        error={{
          message: '退款金额超过额度',
          code: 'REFUND_LIMIT',
          traceId: 'request-123',
          details: {
            note: ['<script>bad()</script>'],
            amount: ['剩余可退 10.00'],
          },
        }}
      />,
    );
    expect(screen.getByText('退款金额超过额度')).toBeInTheDocument();
    expect(screen.queryByText('请求编号：request-123')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('查看错误详情'));
    expect(
      await screen.findByText('请求编号：request-123'),
    ).toBeInTheDocument();
    expect(screen.getByText(/剩余可退 10.00/)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });
});
