import { localizedLabels } from '../../i18n';
import { t as tr, useLocale } from '../../i18n';
import { useState } from 'react';
import { Button, Card, Drawer, Empty, Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { importApi } from '../../api/operations';
import { ErrorState } from '../../components/Feedback';
import { Money } from '../../components/Money';
import { formatDate } from '../../utils/finance';
import type { ImportAttempt, ImportOutcome, ImportRow } from '../../types';
const labels = localizedLabels({
  Ready: '未导入',
  Imported: '已导入',
  Duplicate: '跳过 · 重复',
  Invalid: '跳过 · 异常',
  Suspected: '疑似重复 · 待确认',
  Skipped: '跳过 · 人工确认',
});
export function ImportExecutionHistory({
  id,
  completed,
}: {
  id: string;
  completed: boolean;
}) {
  useLocale();
  const [page, setPage] = useState(1);
  const [resultPage, setResultPage] = useState(1);
  const [selected, setSelected] = useState<ImportAttempt>();
  const [detailPage, setDetailPage] = useState(1);
  const history = useQuery({
    queryKey: ['importAttempts', id, page],
    queryFn: () => importApi.attempts(id, page),
  });
  const results = useQuery({
    queryKey: ['importRows', id, 'results', resultPage],
    enabled: completed,
    queryFn: () => importApi.rows(id, resultPage),
  });
  const details = useQuery({
    queryKey: ['importAttemptRows', id, selected?.id, detailPage],
    enabled: !!selected,
    queryFn: () => importApi.attemptRows(id, selected!.id, detailPage),
  });
  return (
    <>
      {completed && (
        <Card className="mt20" title={tr("逐行导入结果")}>
          {results.isError ? (
            <ErrorState error={results.error} retry={() => results.refetch()} />
          ) : (
            <Table<ImportRow>
              rowKey="id"
              loading={results.isPending}
              dataSource={results.data?.items}
              scroll={{ x: 700 }}
              pagination={{
                current: resultPage,
                pageSize: 20,
                total: results.data?.total,
                onChange: setResultPage,
                showSizeChanger: false,
              }}
              columns={[
                { title: tr("行号"), dataIndex: 'index' },
                {
                  title: tr("结果"),
                  render: (_, row) => <Tag>{labels[row.status]}</Tag>,
                },
                {
                  title: tr("金额"),
                  render: (_, row) => (
                    <Money
                      value={row.amount}
                      currency={row.currency}
                      type={row.type === 'Unknown' ? undefined : row.type}
                    />
                  ),
                },
                {
                  title: tr("说明"),
                  render: (_, row) =>
                    row.issues.join('；') ||
                    (row.status === 'Duplicate'
                      ? '按重复检测结果跳过，未创建交易'
                      : row.status === 'Imported'
                        ? '已创建本批次交易'
                        : '未创建交易'),
                },
              ]}
            />
          )}
        </Card>
      )}
      <Card className="mt20" title={tr("导入处理记录")}>
        {history.isError ? (
          <ErrorState error={history.error} retry={() => history.refetch()} />
        ) : (
          <Table<ImportAttempt>
            rowKey="id"
            size="small"
            loading={history.isPending}
            dataSource={history.data?.items}
            scroll={{ x: 700 }}
            locale={{ emptyText: <Empty description={tr("暂无处理记录")} /> }}
            pagination={{
              current: page,
              pageSize: 10,
              total: history.data?.total,
              onChange: setPage,
              showSizeChanger: false,
            }}
            columns={[
              {
                title: tr("时间"),
                render: (_, row) => formatDate(row.createdAt, true, true),
              },
              {
                title: tr("状态"),
                render: (_, row) => (
                  <Tag color={row.state === 'Completed' ? 'green' : 'orange'}>
                    {row.state === 'Completed' ? tr("已完成") : tr("未完成")}
                  </Tag>
                ),
              },
              {
                title: tr("已导入 / 跳过"),
                render: (_, row) => `${row.imported} / ${row.skipped}`,
              },
              { title: tr("处理说明"), dataIndex: 'message' },
              {
                title: tr("操作"),
                render: (_, row) => (
                  <Button
                    onClick={() => {
                      setSelected(row);
                      setDetailPage(1);
                    }}
                  >
                    {tr("查看逐行报告")}</Button>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Drawer
        title={tr("导入处理明细")}
        open={!!selected}
        onClose={() => setSelected(undefined)}
        width={640}
      >
        <p>{selected?.message}</p>
        {details.isError ? (
          <ErrorState error={details.error} retry={() => details.refetch()} />
        ) : (
          <Table<ImportOutcome>
            rowKey="id"
            size="small"
            loading={details.isPending}
            dataSource={details.data?.items}
            locale={{
              emptyText: (
                <Empty description={tr("本次没有可定位的行级错误，请参考处理说明；未提交任何本次交易")} />
              ),
            }}
            pagination={{
              current: detailPage,
              pageSize: 20,
              total: details.data?.total,
              onChange: setDetailPage,
              showSizeChanger: false,
            }}
            columns={[
              { title: tr("行号"), dataIndex: 'index' },
              {
                title: tr("状态"),
                render: (_, row) =>
                  row.status === 'Imported'
                    ? '已导入'
                    : row.status === 'Duplicate'
                      ? '重复'
                      : row.status === 'Invalid'
                        ? '未通过'
                        : labels[row.status],
              },
              {
                title: tr("说明"),
                render: (_, row) =>
                  row.issues.join('；') ||
                  (row.status === 'Duplicate' ? '重复检测命中' : '校验通过'),
              },
            ]}
          />
        )}
      </Drawer>
    </>
  );
}
