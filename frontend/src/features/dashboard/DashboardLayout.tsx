import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Checkbox, Popover, Segmented, Space } from 'antd';

const modules = {
  trend: '收支趋势',
  insights: 'AI 财务洞察',
  budget: '预算',
  categories: '支出分类',
  calendar: '交易日历',
  transactions: '最近交易',
  accounts: '账户资产',
  planning: '财务规划',
  history: '历史回顾',
};
export type DashboardModule = keyof typeof modules;
const key = 'pf-dashboard-layout-v1';
export function useDashboardLayout() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById('shell-search')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const [hidden, setHidden] = useState<DashboardModule[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(saved)
        ? saved.filter(
            (v): v is DashboardModule => typeof v === 'string' && v in modules,
          )
        : [];
    } catch {
      return [];
    }
  });
  const save = (next: DashboardModule[]) => {
    setHidden(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* Session settings remain usable when storage is unavailable. */
    }
  };
  return {
    visible: (id: DashboardModule) => !hidden.includes(id),
    controls: (
      <Space wrap><Button onClick={() => document.getElementById('shell-search')?.focus()}>全局搜索 · Ctrl+K</Button><Button onClick={() => navigate('/reconciliation')}>智能对账</Button>
        <Segmented
          aria-label="驾驶舱工作模式"
          options={['完整', '日常', '分析']}
          onChange={(mode) =>
            save(
              mode === '日常'
                ? ['insights', 'categories', 'planning', 'history']
                : mode === '分析'
                  ? ['calendar', 'transactions', 'history']
                  : [],
            )
          }
        />
        <Popover
          trigger="click"
          title="首页模块"
          content={
            <Space direction="vertical">
              {Object.entries(modules).map(([id, label]) => (
                <Checkbox
                  key={id}
                  checked={!hidden.includes(id as DashboardModule)}
                  onChange={(e) =>
                    save(
                      e.target.checked
                        ? hidden.filter((v) => v !== id)
                        : [...hidden, id as DashboardModule],
                    )
                  }
                >
                  {label}
                </Checkbox>
              ))}
              <Button onClick={() => save([])}>恢复完整布局</Button>
            </Space>
          }
        >
          <Button>自定义首页</Button>
        </Popover>
      </Space>
    ),
  };
}
