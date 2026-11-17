import { afterEach, describe, expect, it } from 'vitest';
import {
  copilotMessagePrefix,
  routeCopilotContext,
  sanitizeCopilotFields,
} from '../features/ai/copilotContext';
import { useUI } from '../stores/ui';
const account = '12345678-1234-1234-1234-123456789abc';
afterEach(() => useUI.getState().setLanguage('zh-CN'));
describe('global Copilot context boundary', () => {
  it('captures account and period while excluding arbitrary free text and secrets', () => {
    const context = routeCopilotContext(
      '/transactions',
      `?accountId=${account}&start=2026-10-01&end=2026-10-31&currency=USD&password=secret&keyword=private-person&merchant=private-shop`,
    );
    expect(context.fields).toEqual({
      accountIds: [account],
      start: '2026-10-01',
      end: '2026-10-31',
      currency: 'USD',
    });
    expect(JSON.stringify(context)).not.toMatch(/secret|private/);
  });
  it('keeps an invalid account selection blocked rather than silently widening it', () => {
    expect(
      routeCopilotContext('/transactions', '?accountId=invalid').fields
        .accountIds,
    ).toEqual([]);
    expect(sanitizeCopilotFields({ accountIds: [account, 'invalid'] })).toEqual(
      { accountIds: [] },
    );
  });
  it('takes the account detail ID and never mistakes a transaction ID for an account', () => {
    expect(
      routeCopilotContext('/accounts/' + account, '').fields.accountIds,
    ).toEqual([account]);
    expect(routeCopilotContext('/transactions/' + account, '').fields).toEqual({
      transactionId: account,
    });
  });
  it('marks unsupported filters as context, limits metadata and translates its framing', () => {
    useUI.getState().setLanguage('en');
    const text = copilotMessagePrefix(
      {
        page: 'Transactions',
        path: '/transactions',
        fields: { accountIds: [account], status: 'NeedsReview' },
      },
      true,
    );
    expect(text).toContain('never claim these filters were applied');
    expect(text).toContain('"accountScope":"selected"');
    expect(text).not.toContain(account);
    expect(text).toContain('My question:');
  });
});
