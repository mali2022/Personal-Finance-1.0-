import { t as tr, useLocale } from '../../i18n';
import { App, Button, Drawer, Space, Tag } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { importApi } from '../../api/operations';
import { Money } from '../../components/Money';
import { formatDate } from '../../utils/finance';
import type { ApiError, ImportJob, ImportRow } from '../../types';

export function ImportDuplicateReview({
  row,
  job,
  busy,
  close,
  applied,
}: {
  row?: ImportRow;
  job: ImportJob;
  busy: boolean;
  close: () => void;
  applied: (job: ImportJob) => void;
}) {
  useLocale();
  const { message, modal } = App.useApp();
  const review = useMutation({
    mutationFn: (decision: 'Keep' | 'Skip' | 'Clear') =>
      importApi.reviewDuplicate(job.id, row!.id, decision, job.version),
    onSuccess: (data) => {
      applied(data);
      close();
      message.success(tr("判定已保存，最终确认导入后才会改变余额"));
    },
    onError: (error: ApiError) => message.error(error.message),
  });
  function confirm(decision: 'Keep' | 'Skip' | 'Clear') {
    modal.confirm({
      title:
        decision === 'Keep'
          ? tr("确认这是另一笔真实交易？")
          : decision === 'Skip'
            ? tr("确认跳过这条导入记录？")
            : tr("撤销这条重复判定？"),
      content:
        decision === 'Keep'
          ? tr("保留后仍需确认整批导入；请先核对相似记录，避免重复记账。")
          : decision === 'Skip'
            ? tr("仅跳过本次导入行，已有交易不会被删除或修改。")
            : tr("此行将重新进入待核实状态，历史判定保留在操作审计中。"),
      okText: tr("确认判定"),
      onOk: () => review.mutateAsync(decision),
    });
  }
  return (
    <Drawer
      title={tr("核对疑似重复")}
      open={!!row}
      onClose={() => {
        if (!review.isPending) close();
      }}
      width={560}
    >
      {row && (
        <>
          <p>
            <Tag>{tr("第")}{row.index} {tr("行")}</Tag>
            {formatDate(row.occurredAt, true, true)}
          </p>
          <h2>
            <Money value={row.amount} currency={row.currency} type={row.type === 'Unknown' ? undefined : row.type} />
          </h2>
          <p>{row.merchant || tr("未填写商户")}</p>
          <p>{tr("发现")}{row.candidateCount || 0} {tr("条相似记录，最多展示 20 条：")}</p>
          <ul>
            {row.duplicateCandidates?.map((candidate) => (
              <li key={candidate.kind + candidate.id}>
                {candidate.kind === 'Transaction' ? (
                  <Link
                    to={`/transactions/${candidate.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {tr("打开已记交易核对")}</Link>
                ) : (
                  `本批次第 ${candidate.index} 行`
                )}
              </li>
            ))}
          </ul>
          {row.reviewDecision && (
            <p>
              {tr("当前判定：")}{row.reviewDecision === 'Keep'
                ? tr("保留为独立交易")
                : tr("跳过本次导入")}
              ；{row.reviewedAt && formatDate(row.reviewedAt, true, true)}
            </p>
          )}
          <Space wrap>
            <Button
              type="primary"
              disabled={busy || review.isPending}
              onClick={() => confirm('Keep')}
            >
              {tr("保留为独立交易")}</Button>
            <Button
              disabled={busy || review.isPending}
              onClick={() => confirm('Skip')}
            >
              {tr("跳过本次导入")}</Button>
            {row.reviewDecision && (
              <Button
                disabled={busy || review.isPending}
                onClick={() => confirm('Clear')}
              >
                {tr("撤销判定")}</Button>
            )}
          </Space>
        </>
      )}
    </Drawer>
  );
}
