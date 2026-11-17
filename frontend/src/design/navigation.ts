import { reportAnalysisSections } from '../features/reports/sections';
import { localizedPair, t as tr } from '../i18n';

// A section is a labelled band inside a group's detail panel; a group owns one
// rail icon. Every destination still has exactly one owner in this tree.
export interface NavigationSection {
  key: string;
  readonly label?: string;
  routes: [string, string][];
}
export interface NavigationGroup {
  key: string;
  readonly label: string;
  sections: NavigationSection[];
}
export function groupRoutes(group: NavigationGroup): [string, string][] {
  return group.sections.flatMap((section) => section.routes);
}
export const navigationGroups: NavigationGroup[] = [
  {
    key: 'overview',
    get label() {
      return tr('总览');
    },
    sections: [
      {
        key: 'overview-start',
        routes: [
          localizedPair('/', '首页'),
          localizedPair('/dashboard', '仪表盘'),
          localizedPair('/memories/on-this-day', '历史上的今天'),
        ],
      },
    ],
  },
  {
    key: 'bookkeeping',
    get label() {
      return tr('记账');
    },
    sections: [
      {
        key: 'bookkeeping-trade',
        get label() {
          return tr('交易');
        },
        routes: [
          localizedPair('/books', '账本中心'),
          localizedPair('/families', '家庭中心'),
          localizedPair('/bookkeeping/new', '记账中心'),
          localizedPair('/transactions', '全部交易'),
          localizedPair('/transactions/review', '待整理中心'),
          localizedPair('/import', '导入中心'),
        ],
      },
      {
        key: 'bookkeeping-organize',
        get label() {
          return tr('组织');
        },
        routes: [
          localizedPair('/categories', '收支分类'),
          localizedPair('/merchants', '商户'),
          localizedPair('/tags', '标签'),
          localizedPair('/projects', '项目'),
          localizedPair('/templates', '记账模板'),
          localizedPair('/automation', '自动分类规则'),
        ],
      },
      {
        key: 'bookkeeping-special',
        get label() {
          return tr('专项');
        },
        routes: [localizedPair('/concerts', '演唱会专项记账')],
      },
    ],
  },
  {
    key: 'assets',
    get label() {
      return tr('账户与资产');
    },
    sections: [
      {
        key: 'assets-accounts',
        get label() {
          return tr('账户');
        },
        routes: [
          localizedPair('/accounts', '账户管理'),
          localizedPair('/reconciliation', '账户对账'),
          localizedPair('/accounts/fund-status', '冻结与在途资金'),
          localizedPair('/settings/payment-instruments', '付款授权'),
        ],
      },
      {
        key: 'assets-holdings',
        get label() {
          return tr('资产');
        },
        routes: [
          localizedPair('/investments', '投资管理'),
          localizedPair('/investments/performance', '投资收益分析'),
          localizedPair('/term-deposits', '定期存款'),
          localizedPair('/physical-assets', '实物资产'),
          localizedPair('/assets/allocation', '资产配置'),
        ],
      },
      {
        key: 'assets-counterparties',
        get label() {
          return tr('往来');
        },
        routes: [
          localizedPair('/loans', '借出与借入'),
          localizedPair('/loan-schedules', '借款还款计划'),
          localizedPair('/prepayments', '预付款押金'),
          localizedPair('/advances', '代买代付'),
          localizedPair('/reimbursements', '报销管理'),
        ],
      },
    ],
  },
  {
    key: 'payroll-center',
    get label() {
      return tr('薪酬与社保');
    },
    sections: [
      {
        key: 'payroll-income',
        get label() {
          return tr('薪酬');
        },
        routes: [
          localizedPair('/payroll', '薪酬总览'),
          localizedPair('/payroll/slips', '月度工资条'),
          localizedPair('/payroll/employers', '就业单位'),
          localizedPair('/payroll/employments', '工作经历'),
          localizedPair('/payroll/plans', '薪酬方案'),
          localizedPair('/payroll/bonuses', '奖金与补贴'),
        ],
      },
      {
        key: 'payroll-statutory',
        get label() {
          return tr('社保与税务');
        },
        routes: [
          localizedPair('/payroll/insurance', '社会保险'),
          localizedPair('/payroll/housing', '住房公积金'),
          localizedPair('/payroll/tax', '个人所得税'),
          localizedPair('/payroll/deductions', '专项附加扣除'),
          localizedPair('/payroll/policies', '政策与历史版本'),
        ],
      },
      {
        key: 'payroll-tools',
        get label() {
          return tr('工具');
        },
        routes: [
          localizedPair('/payroll/imports', '工资条导入'),
          localizedPair('/payroll/reconciliation', '工资对账'),
          localizedPair('/payroll/calendar', '薪酬日历'),
          localizedPair('/payroll/statistics', '薪酬统计'),
          localizedPair('/payroll/report', '薪酬年度报告'),
          localizedPair('/payroll/ai', 'AI 薪酬助手'),
        ],
      },
    ],
  },
  {
    key: 'planning',
    get label() {
      return tr('预算与计划');
    },
    sections: [
      {
        key: 'planning-budget',
        get label() {
          return tr('预算');
        },
        routes: [
          localizedPair('/budgets', '预算计划'),
          localizedPair('/budgets/annual', '年度预算'),
          localizedPair('/goals', '储蓄目标'),
          localizedPair('/planning/indicators', '应急储备分析'),
          localizedPair('/cashflow', '现金流预测'),
          localizedPair('/spending-approvals', 'AI 消费审批'),
        ],
      },
      {
        key: 'planning-cycles',
        get label() {
          return tr('周期与订阅');
        },
        routes: [
          localizedPair('/recurring', '周期交易'),
          localizedPair('/subscriptions', '订阅管理'),
          localizedPair('/calendar', '财务日历'),
          localizedPair('/festivals', '节日与纪念日'),
        ],
      },
      {
        key: 'planning-decisions',
        get label() {
          return tr('决策');
        },
        routes: [
          localizedPair('/planning/life-simulator', '人生财务决策模拟器'),
          localizedPair('/planning/spending-value', '消费价值决策实验室'),
          localizedPair('/benefits', '优惠与权益'),
        ],
      },
    ],
  },
  {
    key: 'analysis',
    get label() {
      return tr('分析与报告');
    },
    sections: [
      {
        key: 'analysis-reports',
        get label() {
          return tr('报告');
        },
        routes: [
          localizedPair('/financial-reports', '财务报告中心'),
          localizedPair('/reports', '统计分析'),
          ...reportAnalysisSections.map(({ path, title }) =>
            localizedPair(path, title),
          ),
          localizedPair('/reports/custom', '自定义报表'),
        ],
      },
      {
        key: 'analysis-topics',
        get label() {
          return tr('专项分析');
        },
        routes: [
          localizedPair('/analytics/fuel', '加油与油耗'),
          localizedPair('/analytics/living-cost', '生活成本管理'),
          localizedPair('/analytics/living-cost/index', '生活成本指数'),
        ],
      },
      {
        key: 'analysis-time',
        get label() {
          return tr('时间资产');
        },
        routes: [
          localizedPair('/time-assets', '时间概览'),
          localizedPair('/time-assets/activities', '时间流水'),
          localizedPair('/time-assets/valuation', '时间估值'),
          localizedPair('/time-assets/budgets', '时间预算'),
          localizedPair('/time-assets/finance', '时间与财务'),
          localizedPair('/time-assets/projects', '时间投资项目'),
          localizedPair('/time-assets/ai', 'AI 时间分析'),
          localizedPair('/time-assets/reports', '时间资产报告'),
        ],
      },
    ],
  },
  {
    key: 'ai-center',
    get label() {
      return tr('AI 智能中心');
    },
    sections: [
      {
        key: 'ai-center-start',
        routes: [
          localizedPair('/ai-center', 'AI 总览'),
          localizedPair('/ai-center/agent', '自主财务 Agent'),
          localizedPair('/ai-center/advanced', 'AI 智能管理 · 高级功能'),
          localizedPair('/ai-center/copilot', 'AI 财务 Copilot'),
          localizedPair('/ai-center/bookkeeping', '智能记账'),
          localizedPair('/ai-center/risks', '风险预警'),
          localizedPair('/ai-center/reports', 'AI 财务报告'),
          localizedPair('/ai-center/memory', 'AI 记忆'),
        ],
      },
    ],
  },
];
export const settingsNavigation: NavigationGroup = {
  key: 'settings',
  get label() {
    return tr('设置与管理');
  },
  sections: [
    {
      key: 'settings-manage',
      routes: [
        localizedPair('/settings', '设置与管理'),
        localizedPair('/profile', '个人信息中心'),
        localizedPair('/settings/currencies', '货币与汇率'),
        localizedPair('/settings/statistics', '财务统计口径管理'),
        localizedPair('/settings/ai', 'AI 与隐私'),
        localizedPair('/settings/updates', '版本更新'),
        localizedPair('/help', '帮助与反馈'),
      ],
    },
  ],
};
export const navigationEntries: NavigationGroup[] = [
  ...navigationGroups,
  settingsNavigation,
];
export const navigationAliases: Record<string, string> = {
  '/ai': '/ai-center/agent',
  '/ai/agent': '/ai-center/agent',
  '/ai/copilot': '/ai-center/copilot',
  '/settings/ai/advanced': '/ai-center/advanced',
  '/ai-center/analysis': '/reports',
  '/ai-center/cashflow': '/cashflow',
  '/ai-center/budget': '/budgets',
  '/ai-center/assets': '/accounts',
  '/ai-center/subscriptions': '/subscriptions',
  '/ai-center/goals': '/goals',
  '/ai-center/automation': '/automation',
  '/ai-center/settings': '/settings/ai',
};
export function canonicalNavigationPath(path: string) {
  const alias = Object.keys(navigationAliases)
    .sort((a, b) => b.length - a.length)
    .find((key) => path === key || path.startsWith(key + '/'));
  return alias ? navigationAliases[alias] + path.slice(alias.length) : path;
}
export function activeNavigation(path: string) {
  path = canonicalNavigationPath(path);
  if (path === '/admin' || path.startsWith('/admin/'))
    return {
      key: '/admin',
      label: tr('后台管理'),
      group: 'settings',
      groupLabel: settingsNavigation.label,
    };
  const routes = navigationEntries.flatMap((g) =>
    groupRoutes(g).map(([key, label]) => ({
      key,
      label,
      group: g.key,
      groupLabel: g.label,
    })),
  );
  return routes
    .filter(
      (r) => path === r.key || (r.key !== '/' && path.startsWith(r.key + '/')),
    )
    .sort((a, b) => b.key.length - a.key.length)[0];
}
