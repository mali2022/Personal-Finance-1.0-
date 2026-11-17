import { LegacyFundBalances } from '../features/payroll/LegacyFundBalances';
import { usePayrollCatalog } from '../features/payroll/catalog';
import { lazy, Suspense, useState } from 'react';
import { Alert, Button, Card, Skeleton, Space, Tabs, Tag } from 'antd';
import { Link, useParams } from 'react-router-dom';
import { usePayLabel, usePayText } from '../features/payroll/text';
import { RecordManager, models } from '../features/payroll/Forms';
import { PayrollOverview, PayrollCalendar } from '../features/payroll/Overview';
import { Payslips } from '../features/payroll/Payslips';
import {
  PayrollDeductions,
  PayrollPolicies,
  PayrollTax,
} from '../features/payroll/TaxAndPolicies';
import { PayrollImports } from '../features/payroll/Imports';
import { useCopilotPageContext } from '../features/ai/copilotContext';
import '../design/payroll.css';
const AiPage = lazy(() => import('./AiPage'));
const modules = [
  'overview',
  'slips',
  'employers',
  'employments',
  'plans',
  'bonuses',
  'insurance',
  'housing',
  'tax',
  'deductions',
  'imports',
  'reconciliation',
  'calendar',
  'statistics',
  'report',
  'ai',
  'policies',
];
export default function PayrollCenterPage() {
  const t = usePayText();
  const catalogs = usePayrollCatalog();
  const label = usePayLabel();
  const { section = 'overview' } = useParams();
  const current = modules.includes(section) ? section : 'overview';
  const year = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    timeZone: 'Asia/Shanghai',
  }).format(new Date());
  useCopilotPageContext({
    start: year + '-01-01',
    end: year + '-12-31',
    currency: 'CNY',
  });
  const content = () => {
    if (['employers', 'employments', 'plans', 'insurance'].includes(current))
      return <RecordManager key={current} model={models[current]} />;
    if (current === 'housing')
      return (
        <Tabs
          items={[
            {
              key: 'accounts',
              label: t('账户与实际余额', 'Accounts & balances'),
              children: (
                <div className="payroll-stack">
                  <RecordManager model={models.housing} />
                  <LegacyFundBalances />
                </div>
              ),
            },
            {
              key: 'contributions',
              label: t('缴存与差额', 'Contributions & differences'),
              children: (
                <RecordManager
                  model={{
                    ...models.insurance,
                    params: { housing: 'true' },
                    defaults: {
                      ...models.insurance.defaults,
                      kind: 'HousingFund',
                    },
                    columns: [
                      'month',
                      'kind',
                      'personalAmount',
                      'employerAmount',
                      'expectedPersonal',
                      'expectedEmployer',
                      'state',
                    ],
                  }}
                />
              ),
            },
            {
              key: 'events',
              label: t('提取、结息与转移', 'Withdrawals, interest & transfers'),
              children: <RecordManager model={models['fund-events']} />,
            },
          ]}
        />
      );
    if (current === 'slips' || current === 'reconciliation')
      return (
        <Payslips key={current} reconciliation={current === 'reconciliation'} />
      );
    if (current === 'tax') return <PayrollTax />;
    if (current === 'deductions') return <PayrollDeductions />;
    if (current === 'policies') return <PayrollPolicies />;
    if (current === 'imports') return <PayrollImports />;
    if (current === 'calendar') return <PayrollCalendar />;
    if (current === 'ai') return <PayrollAi />;
    return (
      <PayrollOverview
        report={current === 'report'}
        statistics={current === 'statistics'}
        bonuses={current === 'bonuses'}
      />
    );
  };
  return (
    <div className="payroll-center">
      <div className="payroll-banner">
        <div>
          <h1>{t('薪酬与社保中心', 'Payroll & Social Benefits')}</h1>
        </div>
        <Tag color="blue">
          {t('沿用已有账本 · 避免重复记账', 'Connected to your ledger')}
        </Tag>
      </div>
      {catalogs.employers.data?.length === 0 && (
        <Card
          size="small"
          style={{ marginBottom: 20 }}
          title={t('开始管理薪酬', 'Set up payroll')}
        >
          <Space wrap>
            {[
              ['employers', '1 · 就业单位', '1 · Employer'],
              ['employments', '2 · 工作经历', '2 · Employment'],
              ['plans', '3 · 薪酬方案', '3 · Pay plan'],
              ['slips', '4 · 工资条', '4 · Payslip'],
              ['policies', '5 · 核对政策', '5 · Review policies'],
            ].map(([path, zh, en]) => (
              <Link key={path} to={'/payroll/' + path}>
                {t(zh, en)}
              </Link>
            ))}
          </Space>
          <p className="payroll-callout">
            {t(
              '历史工资条继续保留。可在更正时补充工作经历与项目属性，不根据旧项目名称猜测税务性质。',
              'Existing payslips remain available. Link employment and review item attributes through a versioned correction; tax treatment is never inferred from old names.',
            )}
          </p>
        </Card>
      )}
      <h2 style={{ fontSize: 20, margin: '2px 0 20px' }}>{label(current)}</h2>
      <Suspense fallback={<Skeleton active />}>{content()}</Suspense>
    </div>
  );
}
function PayrollAi() {
  const t = usePayText();
  const [question, setQuestion] = useState('');
  const prompts = [
    [
      '为什么这个月实发工资减少了？请查询薪酬中心完整年度数据，比较最近两个月的工资结构、个税和代扣，并标明缺失记录。',
      'Why did my net salary decrease this month? Query the payroll center for this full year and compare pay structure, tax and deductions; identify missing data.',
    ],
    [
      '我的社保个人缴费是多少？今年公积金累计缴存多少？区分实际和预计、个人和单位部分。',
      'How much personal social insurance and housing fund contributions have been recorded this year? Separate actual/expected and personal/employer amounts.',
    ],
    [
      '今年年终奖是多少？我的工资比去年增长多少？请分别查询两个完整自然年度，不推测未来月份。',
      'What annual bonus is recorded this year and how has my salary grown year over year? Query both full calendar years without predicting missing months.',
    ],
    [
      '这个月工资到账了吗？请区分工资条实发和关联银行到账，指出未对账的限制。',
      'Has my salary arrived this month? Distinguish payslip net pay from linked bank receipts and note reconciliation limits.',
    ],
    [
      '为什么实际个税和模拟结果不同？请读取薪酬中心已保存的税额模拟，并注明政策版本、输入口径和未核对扣除的影响。',
      'Why does actual tax differ from simulation? Read saved payroll simulations and cite rule versions, input scope and unreviewed deductions.',
    ],
    [
      '如果基本工资增加或换参保城市，实发工资会怎样变化？请先核查中心已有模拟，不要自行猜测地方费率或扣除资格。',
      'How might higher base pay or another insurance city affect net pay? Check saved center simulations first; do not invent local rates or deduction eligibility.',
    ],
  ];
  return (
    <div className="payroll-stack">
      <Alert
        type="info"
        showIcon
        message={t(
          '使用现有 DeepSeek 连接及独立的薪酬数据授权。答案基于已登记数据和模拟历史；未配置密钥或未授权时使用现有设置流程。',
          'Uses the existing DeepSeek connection and separate payroll-data consent. Answers rely on recorded facts and simulation history; configuration and consent use the existing settings flow.',
        )}
      />
      <Card>
        <Space wrap>
          {prompts.map(([zh, en]) => (
            <Button
              key={zh}
              style={{
                height: 'auto',
                whiteSpace: 'normal',
                textAlign: 'left',
              }}
              onClick={() => setQuestion(t(zh, en))}
            >
              {t(zh.split('？')[0] + '？', en.split('?')[0] + '?')}
            </Button>
          ))}
          <Link to="/settings/ai">
            {t('AI 与隐私设置', 'AI & privacy settings')}
          </Link>
          <Link to="/payroll/tax">
            {t('前往确定性模拟器', 'Open rules-based simulator')}
          </Link>
        </Space>
      </Card>
      <AiPage key={question} initialQuestion={question} />
    </div>
  );
}
