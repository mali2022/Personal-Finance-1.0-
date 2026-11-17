import { t as tr, useLocale } from '../i18n';
import { useUI } from '../stores/ui';
import { Alert, Button, Collapse, Empty } from 'antd';
import { isApiError } from '../utils/errors';
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  useLocale();
  const hidden = useUI((s) => s.hidden);
  const failure = isApiError(error) ? error : undefined;
  return (
    <Alert
      role="alert"
      type="error"
      showIcon
      message={
        hidden
          ? tr("请求遇到问题，请关闭隐私模式查看详情")
          : failure?.message || (error instanceof Error && error.message ? error.message : tr("加载失败，请重试"))
      }
      description={
        !hidden &&
        failure &&
        (failure.details || failure.traceId) && (
          <Collapse
            ghost
            items={[
              {
                key: 'details',
                label: tr("查看错误详情"),
                children: (
                  <>
                    <p>{tr("错误代码：")}{failure.code}</p>
                    {failure.traceId && <p>{tr("请求编号：")}{failure.traceId}</p>}
                    {failure.details && (
                      <pre className="error-details">
                        {JSON.stringify(failure.details, null, 2)}
                      </pre>
                    )}
                  </>
                ),
              },
            ]}
          />
        )
      }
      action={retry && <Button onClick={retry}>{tr("重试")}</Button>}
    />
  );
}
export function EmptyState({
  action,
  description = '暂无记录',
}: {
  action?: () => void;
  description?: string;
}) {
  useLocale();
  return (
    <Empty description={description}>
      {action && (
        <Button type="primary" onClick={action}>
          {tr("记第一笔账")}</Button>
      )}
    </Empty>
  );
}
