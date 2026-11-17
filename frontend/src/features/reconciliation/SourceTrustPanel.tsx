import { useState } from 'react';
import { Alert, Button, Descriptions, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from '../../i18n';
import { smartApi } from './api';
import { ErrorState } from '../../components/Feedback';
export function SourceTrustPanel({
  accountId,
  importJobId,
}: {
  accountId: string;
  importJobId: string;
}) {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['smart-reconciliation', 'source-trust', accountId, importJobId],
    queryFn: () => smartApi.trustInfo(accountId, importJobId),
    enabled: open,
  });
  return (
    <details
      className="mt20 mb16"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>{t('来源核准与摘要', 'Source approval and digests')}</summary>
      <Alert
        className="mb16"
        message={t(
          '只有服务器管理员核准到此用户、账户、文件摘要和映射摘要，且未过期时，来源才可参与自动确认。这不是银行联网认证；客户端不能自行声明可信。',
          'Only an unexpired server approval bound to this user, account, file digest and mapping digest permits automatic confirmation. This is not a bank connection or bank authentication; clients cannot self-declare trust.',
        )}
      />
      {q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : q.data ? (
        <Descriptions
          column={1}
          size="small"
          items={[
            {
              key: 'state',
              label: t('服务器核准', 'Server approval'),
              children: q.data.trusted
                ? t('有效', 'Valid')
                : t('未核准或已过期', 'Not approved or expired'),
            },
            {
              key: 'file',
              label: t('文件摘要', 'File digest'),
              children: (
                <Typography.Text copyable style={{ overflowWrap: 'anywhere' }}>
                  {q.data.sourceHash}
                </Typography.Text>
              ),
            },
            {
              key: 'mapping',
              label: t('映射摘要', 'Mapping digest'),
              children: (
                <Typography.Text copyable style={{ overflowWrap: 'anywhere' }}>
                  {q.data.mappingHash}
                </Typography.Text>
              ),
            },
            {
              key: 'expiry',
              label: t('核准到期', 'Approval expiry'),
              children: q.data.expiresAt || '—',
            },
          ]}
        />
      ) : (
        <Button loading={q.isFetching} onClick={() => void q.refetch()}>
          {t('读取摘要', 'Read digests')}
        </Button>
      )}
    </details>
  );
}
