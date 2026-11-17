import { useState } from 'react';
import { Card, List, Space } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { aiApi, type AiConversationDetail } from '../api/ai';
import { AiConversationPanel } from '../components/AiConversationPanel';
import { ErrorState } from '../components/Feedback';
import { t, useLocale } from '../i18n';
export default function AiMemoryPage() {
  useLocale();
  const settings = useQuery({
    queryKey: ['ai-settings'],
    queryFn: aiApi.settings,
  });
  const [detail, setDetail] = useState<AiConversationDetail>();
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {settings.isError && (
        <ErrorState error={settings.error} retry={() => settings.refetch()} />
      )}
      <Card title={t('记忆与隐私')}>
        <p>
          {t('保存历史')}：
          {t(settings.data?.privacy.saveHistory ? '已开启' : '未开启')}
        </p>
        <p>
          {t('会话保留天数')}：{settings.data?.historyRetentionDays ?? '—'}
        </p>
        <Link to="/ai-center/settings">{t('调整记忆授权')}</Link>
      </Card>
      <AiConversationPanel
        enabled={settings.data?.privacy.saveHistory === true}
        disabled={false}
        onLoad={setDetail}
        onDelete={() => setDetail(undefined)}
      />
      {detail && (
        <Card title={detail.conversation.title}>
          <List
            dataSource={detail.items}
            renderItem={(m) => <List.Item>{m.question}</List.Item>}
          />
          <Link
            to={'/ai-center/copilot?conversationId=' + detail.conversation.id}
          >
            {t('打开会话')}
          </Link>
        </Card>
      )}
    </Space>
  );
}
