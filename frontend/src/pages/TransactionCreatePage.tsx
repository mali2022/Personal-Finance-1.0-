import { useNavigate } from 'react-router-dom';
import { PageTitle } from '../components/PageTitle';
import { QuickEntry } from '../features/transactions/QuickEntry';
import { t as tr, useLocale } from '../i18n';

export default function TransactionCreatePage() {
  useLocale();
  const navigate = useNavigate();
  return (
    <div className="transaction-create-page">
      <PageTitle>{tr('记账中心')}</PageTitle>
      <QuickEntry
        presentation="page"
        onDone={() => navigate('/transactions')}
      />
    </div>
  );
}
