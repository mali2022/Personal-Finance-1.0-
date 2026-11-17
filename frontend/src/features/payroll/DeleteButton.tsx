import { useRef } from 'react';
import { App, Button, Popconfirm } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { payrollApi, type Row } from './api';
import { usePayText } from './text';
export function PayrollDeleteButton({
  resource,
  row,
  onDeleted,
}: {
  resource: 'slips' | 'plans' | 'contributions';
  row: Row;
  onDeleted?: () => void;
}) {
  const t = usePayText();
  const { message } = App.useApp();
  const cache = useQueryClient();
  const lock = useRef(false);
  const remove = useMutation({
    mutationFn: () =>
      payrollApi.write(
        `/${resource}/${encodeURIComponent(row.id)}`,
        {},
        row.version,
        'delete',
      ),
    onSuccess: () => {
      onDeleted?.();
      void cache.invalidateQueries({ queryKey: ['payroll-center'] });
      message.success(t('已删除', 'Deleted'));
    },
    onError: (error: Error) => {
      message.error(error.message);
    },
    onSettled: () => {
      lock.current = false;
    },
  });
  return (
    <Popconfirm
      title={
        resource === 'contributions'
          ? t('确认删除这条缴费记录？', 'Delete this contribution?')
          : resource === 'slips'
            ? t('确认删除这张工资条？', 'Delete this payslip?')
            : t(
                '确认删除这个薪酬方案版本？',
                'Delete this compensation plan version?',
              )
      }
      description={
        resource === 'contributions'
          ? t(
              '删除后不再计入缴费统计，不修改工资条或账户余额。关联工资条的记录不会自动重新添加。',
              'Removes the record from contribution totals without changing payslips or balances. Linked records will not be added again automatically.',
            )
          : resource === 'slips'
            ? t(
                '将永久删除工资条、构成、附件和更正历史。须先解除到账及缴费关联；原收入交易和账户余额保留。',
                'Permanently deletes the payslip, items, attachments and revision history. Unlink receipts and contributions first. Income transactions and balances are retained.',
              )
            : t(
                '仅删除此版本；被工资条引用时须先解除引用，其他方案版本保留。',
                'Deletes only this version. Remove payslip references first; other versions remain.',
              )
      }
      okText={t('确认删除', 'Delete')}
      cancelText={t('取消', 'Cancel')}
      okButtonProps={{ danger: true, loading: remove.isPending }}
      onConfirm={async () => {
        if (lock.current) return;
        lock.current = true;
        try {
          await remove.mutateAsync();
        } catch {
          /* Error is shown by onError. */
        }
      }}
    >
      <Button danger loading={remove.isPending}>
        {t('删除', 'Delete')}
      </Button>
    </Popconfirm>
  );
}
