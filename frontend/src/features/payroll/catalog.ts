import { useQuery } from '@tanstack/react-query';
import { payrollApi, type Row } from './api';
import { accountApi } from '../../api/finance';
export function usePayrollCatalog() {
  const employers = useQuery({
    queryKey: ['payroll-center', 'employers'],
    queryFn: () => payrollApi.get<Row[]>('/employers'),
  });
  const employments = useQuery({
    queryKey: ['payroll-center', 'employments'],
    queryFn: () => payrollApi.get<Row[]>('/employments'),
  });
  const plans = useQuery({
    queryKey: ['payroll-center', 'plans'],
    queryFn: () => payrollApi.get<Row[]>('/plans'),
  });
  const policies = useQuery({
    queryKey: ['payroll-center', 'policies'],
    queryFn: () => payrollApi.get<Row[]>('/policies'),
  });
  const funds = useQuery({
    queryKey: ['payroll-center', 'fund-accounts'],
    queryFn: () => payrollApi.get<Row[]>('/fund-accounts'),
  });
  const taxRules = useQuery({
    queryKey: ['payroll-center', 'tax-rules'],
    queryFn: () => payrollApi.get<Row[]>('/tax-rules'),
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: accountApi.list,
  });
  return { employers, employments, plans, policies, funds, taxRules, accounts };
}
