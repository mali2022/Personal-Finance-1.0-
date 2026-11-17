import { useState } from 'react';
import {
  Button,
  Card,
  Input,
  List,
  Pagination,
  Popconfirm,
  Space,
  Switch,
  Typography,
} from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  aiApi,
  type AiConversation,
  type AiConversationDetail,
} from '../api/ai';
import { t } from '../i18n';
import { ErrorState } from './Feedback';
import { Sensitive } from './Sensitive';

export function AiConversationPanel({
  enabled,
  disabled,
  onLoad,
  onDelete,
}: {
  enabled: boolean;
  disabled: boolean;
  onLoad: (detail: AiConversationDetail) => void;
  onDelete?: (id: string) => void;
}) {
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<AiConversation>();
  const [title, setTitle] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error>();
  const [messagePage, setMessagePage] = useState(1);
  const [totalMessages, setTotalMessages] = useState(0);
  const history = useQuery({
    queryKey: ['ai-conversations', search, archived, page],
    queryFn: () => aiApi.conversations(search, archived, page),
    enabled,
  });
  const current =
    history.data?.items.find((c) => c.id === active?.id) ?? active;
  async function load(id: string, selectedPage = 1) {
    setPending(true);
    setError(undefined);
    try {
      const detail = await aiApi.conversation(id, selectedPage);
      setActive(detail.conversation);
      setTitle(detail.conversation.title);
      setTotalMessages(detail.total);
      setMessagePage(selectedPage);
      onLoad(detail);
    } catch (e) {
      setError(e as Error);
    } finally {
      setPending(false);
    }
  }
  async function change(nextArchived?: boolean) {
    if (!current) return;
    setPending(true);
    try {
      await aiApi.changeConversation(
        current.id,
        current.version,
        title,
        nextArchived,
      );
      await load(current.id, messagePage);
      await history.refetch();
      void cache.invalidateQueries({ queryKey: ['ai-conversations'] });
    } catch (e) {
      setError(e as Error);
    } finally {
      setPending(false);
    }
  }
  if (!enabled) return null;
  return (
    <Card className="ai-conversation-panel" title={t('会话历史')}>
      <div className="ai-conversation-controls">
        <Input.Search
          aria-label={t('搜索会话')}
          placeholder={t('搜索会话')}
          maxLength={100}
          allowClear
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <Switch
          checked={archived}
          onChange={(value) => {
            setArchived(value);
            setPage(1);
          }}
          checkedChildren={t('已归档')}
          unCheckedChildren={t('活动会话')}
        />
      </div>
      {history.isError ? (
        <ErrorState error={history.error} retry={() => history.refetch()} />
      ) : (
        <List
          loading={history.isPending || pending}
          dataSource={history.data?.items}
          locale={{ emptyText: t('暂无会话历史') }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="delete"
                  title={t('确认删除会话及其消息？')}
                  onConfirm={async () => {
                    setPending(true);
                    try {
                      await aiApi.clear(item.id);
                      if (active?.id === item.id) setActive(undefined);
                      onDelete?.(item.id);
                      await history.refetch();
                      void cache.invalidateQueries({
                        queryKey: ['ai-conversations'],
                      });
                    } catch (e) {
                      setError(e as Error);
                    } finally {
                      setPending(false);
                    }
                  }}
                >
                  <Button size="small" danger disabled={disabled || pending}>
                    {t('删除')}
                  </Button>
                </Popconfirm>,
              ]}
            >
              <Button
                className="ai-conversation-title"
                type="link"
                disabled={disabled || pending}
                onClick={() => void load(item.id)}
              >
                <Sensitive>{item.title}</Sensitive>
              </Button>
            </List.Item>
          )}
        />
      )}
      <Pagination
        simple
        current={page}
        total={history.data?.total ?? 0}
        pageSize={20}
        showSizeChanger={false}
        onChange={setPage}
      />
      {current && (
        <Space className="ai-conversation-current" direction="vertical" style={{ width: '100%', marginTop: 16 }}>
          <Typography.Text>
            {t('当前会话')}：<Sensitive>{current.title}</Sensitive>
          </Typography.Text>
          <Space wrap>
            <Input
              aria-label={t('会话名称')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              disabled={disabled || pending}
            />
            <Button
              disabled={disabled || pending}
              onClick={() => void change()}
            >
              {t('重命名')}
            </Button>
            <Button
              disabled={disabled || pending}
              onClick={() => void change(!current.archived)}
            >
              {t(current.archived ? '取消归档' : '归档')}
            </Button>
          </Space>
          {totalMessages > 20 && (
            <Pagination
              simple
              current={messagePage}
              total={totalMessages}
              pageSize={20}
              showSizeChanger={false}
              onChange={(selected) => void load(current.id, selected)}
            />
          )}
        </Space>
      )}
      {error && (
        <ErrorState
          error={error}
          retry={() => active && load(active.id, messagePage)}
        />
      )}
    </Card>
  );
}
