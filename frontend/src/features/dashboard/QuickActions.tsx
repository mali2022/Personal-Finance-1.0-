import { t as tr, useLocale } from '../../i18n';
import { Button } from 'antd';
import {
  PlusOutlined,
  ArrowDownOutlined,
  UndoOutlined,
  CreditCardOutlined,
  FileDoneOutlined,
  ImportOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../../stores/ui';

export function QuickActions({ secondary = false }: { secondary?: boolean }) {
  useLocale();
  const openEntry = useUI((s) => s.openEntry);
  const navigate = useNavigate();
  return secondary ? (
    <div
      className="dashboard-shortcuts"
      role="group"
      aria-label={tr('快捷操作')}
    >
      <span className="shortcuts-label">{tr('快捷操作')}</span>
      <Button type="text" onClick={() => navigate('/spending-approvals')}>AI 消费审批</Button>
      <Button
        type="text"
        icon={<UndoOutlined aria-hidden="true" />}
        onClick={() => openEntry('Refund')}
      >
        {tr('退款')}
      </Button>
      <Button
        type="text"
        icon={<CreditCardOutlined aria-hidden="true" />}
        onClick={() => openEntry('CreditCardPayment')}
      >
        {tr('信用卡还款')}
      </Button>
      <Button
        type="text"
        icon={<FileDoneOutlined aria-hidden="true" />}
        onClick={() => navigate('/reimbursements')}
      >
        {tr('报销')}
      </Button>
      <Button
        type="text"
        icon={<ImportOutlined aria-hidden="true" />}
        onClick={() => navigate('/import')}
      >
        {tr('导入账单')}
      </Button>
      <Button
        type="text"
        className="shortcut-report"
        onClick={() => navigate('/reports')}
      >
        {tr('统计分析')}
        <ArrowRightOutlined aria-hidden="true" />
      </Button>
    </div>
  ) : (
    <div
      className="dashboard-entry-actions"
      role="group"
      aria-label={tr('快捷操作')}
    >
      <Button
        size="large"
        icon={<ArrowDownOutlined aria-hidden="true" />}
        onClick={() => openEntry('Income')}
      >
        {tr('记收入')}
      </Button>
      <Button
        size="large"
        type="primary"
        icon={<PlusOutlined aria-hidden="true" />}
        onClick={() => openEntry('Expense')}
      >
        {tr('记支出')}
      </Button>
    </div>
  );
}
