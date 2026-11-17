import { t as tr, useLocale } from '../i18n';
import { Card, Skeleton } from 'antd';
export function LoadingState() {
  useLocale();
  return (
    <div className="loading-state" role="status" aria-label={tr("正在加载页面")}>
      <Card>
        <Skeleton active paragraph={{ rows: 6 }} />
      </Card>
      <span className="sr-only">{tr("正在加载，请稍候")}</span>
    </div>
  );
}
