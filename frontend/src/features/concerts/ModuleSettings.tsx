import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Card, Switch, Space } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { concertApi } from './api';
import { ErrorState } from '../../components/Feedback';
import { t as tr } from '../../i18n';
export function ModuleSettings() {
  const q = useQuery({
    queryKey: ['optional-modules'],
    queryFn: concertApi.modules,
  });
  const cache = useQueryClient();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  return (
    <Card title={tr('可选模块')} className="mt20">
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <Space wrap>
          <span>{tr('演唱会专项记账')}</span>
          <Switch
            aria-label={tr('启用演唱会专项记账')}
            checked={q.data?.concerts || false}
            loading={busy || q.isPending}
            disabled={!q.data}
            onChange={async (enabled) => {
              if (!q.data || busy) return;
              setBusy(true);
              try {
                await concertApi.setModules(enabled, q.data.version);
                await cache.invalidateQueries({
                  queryKey: ['optional-modules'],
                });
                message.success(tr('设置已保存'));
              } catch (e) {
                message.error((e as Error).message);
                await q.refetch();
              } finally {
                setBusy(false);
              }
            }}
          />
          {q.data?.concerts && (
            <Link to="/concerts">{tr('进入演唱会档案')}</Link>
          )}
        </Space>
      )}
    </Card>
  );
}
