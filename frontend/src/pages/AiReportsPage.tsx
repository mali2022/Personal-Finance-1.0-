import { useState } from 'react';
import { Button, Card, List, Pagination, Space, Switch } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { aiApi } from '../api/ai';
import { ErrorState } from '../components/Feedback';
import { t, useLocale } from '../i18n';
import AiPage from './AiPage';
export default function AiReportsPage() {
  useLocale();
  const [page, setPage] = useState(1);
  const [archived, setArchived] = useState(false);
  const [draft, setDraft] = useState<number>();
  const settings = useQuery({
    queryKey: ['ai-settings'],
    queryFn: aiApi.settings,
  });
  const reports = useQuery({
    queryKey: ['ai-conversations', 'reports', archived, page],
    queryFn: () => aiApi.conversations('', archived, page, 'Report'),
    enabled: settings.data?.privacy.saveHistory === true,
  });
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card
        title={t('AI 财务报告')}
        extra={
          <Button type="primary" onClick={() => setDraft(Date.now())}>
            {t('新建财务报告')}
          </Button>
        }
      >
        <Switch
          checked={archived}
          checkedChildren={t('已归档')}
          unCheckedChildren={t('活动会话')}
          onChange={(value) => {
            setArchived(value);
            setPage(1);
          }}
        />
        {reports.isError ? (
          <ErrorState error={reports.error} retry={() => reports.refetch()} />
        ) : (
          <List
            loading={reports.isFetching}
            dataSource={reports.data?.items ?? []}
            locale={{ emptyText: t('暂无 AI 报告') }}
            renderItem={(r) => (
              <List.Item>
                <Link to={'/ai-center/copilot?conversationId=' + r.id}>
                  {r.title}
                </Link>
              </List.Item>
            )}
          />
        )}
        <Pagination
          current={page}
          total={reports.data?.total ?? 0}
          pageSize={20}
          showSizeChanger={false}
          onChange={setPage}
        />
      </Card>
      {draft !== undefined && (
        <AiPage
          key={draft}
          report
          initialQuestion={t(
            '生成{0}的财务报告：汇总收支、预算执行、现金流风险，并列出数据依据与限制。',
            dayjs().format('YYYY-MM'),
          )}
        />
      )}
    </Space>
  );
}
