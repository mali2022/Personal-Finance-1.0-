import dayjs from 'dayjs';
import type { LifeEvent, LifeInput } from '../../api/lifeSimulator';
export type LifePreset =
  'housing' | 'job' | 'unemployment' | 'repayment' | 'retirement' | 'saving';
export function applyLifePreset(
  b: LifeInput,
  type: LifePreset,
  amount: number,
  months: number,
  rate: number,
  date: string,
  cost: number,
  mode: string,
): LifeInput {
  const group = crypto.randomUUID();
  const event = (
    suffix: string,
    kind: string,
    value: number,
    at = date,
  ): LifeEvent => ({
    id: `${group}-${suffix}`,
    name: `${type}: ${suffix}`,
    type: kind,
    date: at,
    amount: value,
    everyMonths: 0,
    growth: 0,
    currency: b.currency,
    fxRate: 1,
    basis: 0,
    note: 'User assumption / 用户假设',
  });
  const events: LifeEvent[] = [];
  const loans = [...b.loans];
  if (type === 'housing') {
    const loanId = group;
    const principal = Math.round(amount * (1 - cost / 100) * 100) / 100;
    if (principal > 0) {
      loans.push({
        id: loanId,
        principal,
        annualRate: rate / 100,
        months,
        firstPayment: dayjs(date).add(1, 'month').format('YYYY-MM-DD'),
        mode,
      });
      events.push({ ...event('mortgage', 'Borrow', principal), loanId });
    }
    events.push(event('purchase', 'BuyAsset', amount));
  } else if (type === 'job')
    events.push(
      event('net income', 'IncomeChange', amount),
      event('relocation', 'Expense', cost),
    );
  else if (type === 'unemployment') {
    events.push(event('income interruption', 'IncomeChange', amount));
    const resume = dayjs(date).add(months, 'month').format('YYYY-MM-DD');
    if (resume < dayjs(b.start).add(b.months, 'month').format('YYYY-MM-DD'))
      events.push(
        event('income recovery', 'IncomeChange', b.monthlyIncome, resume),
      );
    if (cost > 0) events.push(event('emergency', 'Expense', cost));
  } else if (type === 'repayment') {
    if (!b.loans.length)
      throw new Error('请先添加模拟贷款 / Add a simulation loan first');
    events.push(
      { ...event('extra principal', 'Repay', amount), loanId: b.loans[0].id },
      event('fee', 'Expense', cost),
    );
  } else if (type === 'retirement')
    events.push(
      event('pension / part-time', 'IncomeChange', amount),
      event('retirement spending', 'ExpenseChange', cost),
    );
  else
    events.push({
      ...event('monthly investment', 'Invest', amount),
      everyMonths: 1,
    });
  return { ...b, loans, events: [...b.events, ...events] };
}
