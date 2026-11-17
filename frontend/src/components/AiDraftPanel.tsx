import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Input,
  List,
  Pagination,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { aiApi, type AiDraft } from '../api/ai';
import { useUI } from '../stores/ui';
import { t } from '../i18n';
import { ErrorState } from './Feedback';
import { AiDraftAmount } from './AiDraftAmount';
import { Sensitive } from './Sensitive';

export function AiDraftPanel({
  enabled,
  modelReady,
  disabled,
  accountNames,
  categoryNames,
}: {
  enabled: boolean;
  modelReady: boolean;
  disabled: boolean;
  accountNames: Record<string, string>;
  categoryNames: Record<string, string>;
}) {
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const cache = useQueryClient();
  const { message } = App.useApp();
  const controller = useRef<AbortController | undefined>(undefined);
  const operation = useRef<
    | { items: Parameters<typeof aiApi.confirmDrafts>[0]; key: string }
    | undefined
  >(undefined);
  const drafts = useQuery({
    queryKey: ['ai-drafts', page],
    queryFn: () => aiApi.drafts(page),
    enabled,
  });
  useEffect(() => () => controller.current?.abort(), []);
  if (!enabled) return null;
  function review(d: AiDraft) {
    if (
      !d.canOpenEntry ||
      !d.parsed.amount ||
      !d.parsed.date ||
      (d.parsed.intent !== 'Expense' && d.parsed.intent !== 'Income')
    )
      return;
    useUI
      .getState()
      .openAiDraft(d.parsed.intent, {
        amount: d.parsed.amount,
        occurredAt: `${d.parsed.date}T12:00:00+08:00`,
        currency: d.parsed.currency,
        accountId: d.accountId ?? undefined,
        categoryId: d.categoryId ?? undefined,
        merchant: d.parsed.merchant ?? undefined,
        draftId: d.draftId,
        version: d.version,
        note: d.parsed.note,
        tagIds: d.tagIds,
      });
  }
  async function generate() {
    const lines = text
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
    if (
      lines.length < 1 ||
      lines.length > 10 ||
      lines.some((x) => x.length > 4000)
    ) {
      setError(t('每行一条，限1至10条，每条最多4000字'));
      return;
    }
    setBusy(true);
    setError('');
    setBatchErrors([]);
    controller.current = new AbortController();
    try {
      const result = await aiApi.draftBatch(lines, controller.current.signal);
      setBatchErrors(
        result.items
          .filter((x) => x.error)
          .map((x) => `${x.index + 1}: ${x.error}`),
      );
      if (result.unprocessed)
        setBatchErrors((current) => [
          ...current,
          t('有 {0} 条尚未处理', result.unprocessed),
        ]);
      await drafts.refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      controller.current = undefined;
    }
  }
  async function confirm(retry = false) {
    if (!retry) {
      const rows =
        drafts.data?.items.filter(
          (d) => d.draftId && selected.includes(d.draftId),
        ) ?? [];
      if (
        !acknowledged ||
        rows.length < 1 ||
        rows.length > 10 ||
        rows.some((d) => !d.accountId || !d.categoryId || !d.canOpenEntry)
      )
        return;
      operation.current = {
        key: crypto.randomUUID(),
        items: rows.map((d) => ({
          id: d.draftId!,
          version: d.version!,
          transaction: {
            type: d.parsed.intent,
            amount: d.parsed.amount!,
            accountId: d.accountId!,
            categoryId: d.categoryId!,
            occurredAt: `${d.parsed.date}T12:00:00+08:00`,
            merchant: d.parsed.merchant,
            note: d.parsed.note,
            tagIds: d.tagIds,
            aiDuplicateAcknowledged: true,
          },
        })),
      };
    }
    if (!operation.current) return;
    setBusy(true);
    setError('');
    try {
      const result = await aiApi.confirmDrafts(
        operation.current.items,
        operation.current.key,
      );
      operation.current = undefined;
      setSelected([]);
      setAcknowledged(false);
      message.success(t('已确认 {0} 条草稿', result.confirmed));
      await Promise.all(
        [
          'ai-drafts',
          'accounts',
          'transactions',
          'dashboard',
          'reports',
          'budgets',
        ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title={t('待确认草稿与批量记账')}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Input.TextArea
          aria-label={t('批量记账描述')}
          placeholder={t('每行一条，限1至10条，每条最多4000字')}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={40000}
          disabled={busy || disabled}
        />
        <Space>
          <Button
            disabled={!modelReady || busy || disabled}
            onClick={() => void generate()}
          >
            {t('生成批量草稿')}
          </Button>
          {busy && controller.current && (
            <Button onClick={() => controller.current?.abort()}>
              {t('停止')}
            </Button>
          )}
        </Space>
        {batchErrors.map((value, i) => (
          <Alert
            key={i}
            type="warning"
            message={<Sensitive>{value}</Sensitive>}
          />
        ))}
        {drafts.isError ? (
          <ErrorState error={drafts.error} retry={() => drafts.refetch()} />
        ) : (
          <List
            loading={drafts.isPending}
            dataSource={drafts.data?.items}
            locale={{ emptyText: t('暂无待确认草稿') }}
            renderItem={(d) => (
              <List.Item>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Checkbox
                    checked={selected.includes(d.draftId!)}
                    disabled={
                      busy ||
                      disabled ||
                      !d.canOpenEntry ||
                      !d.accountId ||
                      !d.categoryId ||
                      (selected.length >= 10 && !selected.includes(d.draftId!))
                    }
                    onChange={(e) => {
                      operation.current = undefined;
                      setAcknowledged(false);
                      setSelected((current) =>
                        e.target.checked
                          ? [...current, d.draftId!]
                          : current.filter((id) => id !== d.draftId),
                      );
                    }}
                  >
                    <AiDraftAmount parsed={d.parsed} /> ·{' '}
                    {d.parsed.date} · {d.parsed.intent}
                  </Checkbox>
                  <Typography.Text>
                    <Sensitive>
                      {accountNames[d.accountId ?? ''] ??
                        d.parsed.accountHint ??
                        t('待选择')}{' '}
                      ·{' '}
                      {categoryNames[d.categoryId ?? ''] ??
                        d.parsed.categoryHint ??
                        t('待选择')}{' '}
                      · {d.parsed.merchant}
                    </Sensitive>
                  </Typography.Text>
                  {d.parsed.note && (
                    <Typography.Text>
                      <Sensitive>{d.parsed.note}</Sensitive>
                    </Typography.Text>
                  )}
                  <Tag>{t('尚未入账')}</Tag>
                  {d.warnings.map((w) => (
                    <Alert
                      key={w}
                      type="warning"
                      message={<Sensitive>{w}</Sensitive>}
                    />
                  ))}
                  <Space wrap>
                    <Button
                      disabled={busy || disabled || !d.canOpenEntry}
                      onClick={() => review(d)}
                    >
                      {t('修改并单条确认')}
                    </Button>
                    <Button
                      danger
                      disabled={busy || disabled}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await aiApi.deleteDraft(
                            d.draftId!,
                            d.version!,
                            crypto.randomUUID(),
                          );
                          setSelected((current) =>
                            current.filter((id) => id !== d.draftId),
                          );
                          await drafts.refetch();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {t('删除草稿')}
                    </Button>
                  </Space>
                </Space>
              </List.Item>
            )}
          />
        )}
        <Pagination
          current={page}
          total={drafts.data?.total ?? 0}
          pageSize={20}
          showSizeChanger={false}
          onChange={(value) => {
            setPage(value);
            setSelected([]);
            setAcknowledged(false);
          }}
        />
        <Checkbox
          checked={acknowledged}
          disabled={busy || disabled || selected.length === 0}
          onChange={(e) => setAcknowledged(e.target.checked)}
        >
          {t('已核对选中草稿与可能重复交易，确认按以上金额入账')}
        </Checkbox>
        <Button
          type="primary"
          disabled={busy || disabled || !acknowledged || selected.length === 0}
          onClick={() => void confirm()}
        >
          {t('确认选中草稿')}
        </Button>
        {error && <Alert type="error" message={error} />}
        {operation.current && error && (
          <Button
            disabled={busy || disabled}
            onClick={() => void confirm(true)}
          >
            {t('使用原幂等请求重试')}
          </Button>
        )}
      </Space>
    </Card>
  );
}
