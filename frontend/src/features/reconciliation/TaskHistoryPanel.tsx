import { useState } from 'react';
import { Button, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from '../../i18n';
import { ErrorState } from '../../components/Feedback';
import { smartApi } from './api';
export function TaskHistoryPanel({
  id,
  review,
}: {
  id: string;
  review: (id: string) => void;
}) {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['smart-reconciliation', 'task-steps', id, page],
    queryFn: () => smartApi.taskSteps(id, page),
  });
  return (
    <>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        <Table
          rowKey="id"
          dataSource={q.data?.items}
          loading={q.isPending}
          pagination={{
            current: page,
            total: q.data?.total,
            pageSize: 20,
            showSizeChanger: false,
            onChange: setPage,
          }}
          scroll={{ x: 650 }}
          columns={[
            { title: t('批次', 'Step'), dataIndex: 'sequence' },
            { title: t('时间', 'Time'), dataIndex: 'createdAt' },
            {
              title: t('已处理 / 失败', 'Processed / failed'),
              render: (_, r) => `${r.processed} / ${r.failed}`,
            },
            {
              title: t('建议与失败原因', 'Suggestions and errors'),
              render: (_, r) => (
                <>
                  {r.results.map((x) => (
                    <p key={x.statementId}>
                      <Button onClick={() => review(x.statementId)}>
                        {t('复核流水', 'Review statement')}
                      </Button>{' '}
                      {x.error ||
                        `${t('候选数', 'Candidates')}: ${x.candidateCount} · ${x.candidates?.map((c) => `${c.confidence} ${c.score}/100`).join(', ')}`}
                    </p>
                  ))}
                </>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
