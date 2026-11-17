import { useState } from 'react';
import dayjs from 'dayjs';
import { usePreferredCurrency } from '../hooks/useCurrency';
import { useLocale } from '../i18n';
import { HomeWelcome } from '../features/home/HomeWelcome';
import { NetWorthHero } from '../features/home/NetWorthHero';
import { PendingSection } from '../features/home/PendingSection';
import { FinancialOverview } from '../features/home/FinancialOverview';
import { QuickActionsCenter } from '../features/home/QuickActionsCenter';
import { AiInsightsSection } from '../features/home/AiInsightsSection';
import { RecentTransactionsSection } from '../features/home/RecentTransactionsSection';
import '../design/home.css';

/**
 * Apple-style personal finance control centre. Each bento module owns its own
 * query state, so a failing endpoint only degrades that card. `/dashboard`
 * remains the dedicated professional analysis workbench.
 */
export default function HomePage() {
  useLocale();
  const currency = usePreferredCurrency();
  const [month, setMonth] = useState(() => dayjs().format('YYYY-MM'));

  return (
    <div className="pf-page home-page">
      <HomeWelcome month={month} />
      <div className="pf-bento home-bento">
        <NetWorthHero currency={currency} />
        <PendingSection />
        <FinancialOverview
          month={month}
          currency={currency}
          onMonthChange={setMonth}
        />
        <QuickActionsCenter />
        <AiInsightsSection month={month} />
        <RecentTransactionsSection month={month} />
      </div>
    </div>
  );
}
