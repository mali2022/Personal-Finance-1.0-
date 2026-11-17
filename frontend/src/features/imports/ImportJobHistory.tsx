import { useState } from 'react';
import { Button, Card, Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useLocale } from '../../i18n';
import { Sensitive } from '../../components/Sensitive';
import { ErrorState } from '../../components/Feedback';
import { formatDate } from '../../utils/finance';
import { importCleaningApi } from './api412';
export function ImportJobHistory() {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['import-job-history', page],
    queryFn: () => importCleaningApi.jobs(page),
  });
  return (
    <Card
      className="mb16"
      title={t('导入任务与追溯', 'Import jobs & provenance')}
    >
      {q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        <Table
          size="small"
          rowKey="id"
          loading={q.isPending}
          dataSource={q.data?.items}
          scroll={{ x: 700 }}
          pagination={{
            current: page,
            pageSize: 10,
            total: q.data?.total,
            onChange: setPage,
            showSizeChanger: false,
          }}
          columns={[
            {
              title: t('文件', 'File'),
              render: (_, r) => <Sensitive>{r.fileName}</Sensitive>,
            },
            { title: t('来源', 'Source'), dataIndex: 'source' },
            {
              title: t('状态', 'State'),
              render: (_, r) => (
                <Tag>
                  {{
                    Uploaded: t('待映射', 'Map fields'),
                    Preview: t('待核对', 'Review'),
                    Completed: t('已完成', 'Completed'),
                  }[r.state] || r.state}
                </Tag>
              ),
            },
            { title: t('已入账', 'Imported'), dataIndex: 'imported' },
            {
              title: t('原文件检查', 'File check'),
              render: (_, r) =>
                r.sameFileCount > 1 ? (
                  <Tag color="orange">
                    {t(
                      '相同文件曾上传，请核对',
                      'Identical file uploaded before',
                    )}
                  </Tag>
                ) : (
                  '—'
                ),
            },
            {
              title: t('上传时间', 'Uploaded'),
              render: (_, r) =>
                r.createdAt
                  ? formatDate(r.createdAt, true)
                  : t('旧任务未采集', 'Legacy job'),
            },
            {
              title: t('操作', 'Actions'),
              render: (_, r) => (
                <Link to={`/import?job=${r.id}`}>
                  <Button>{t('打开任务', 'Open job')}</Button>
                </Link>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}
