import { useState } from 'react';
import { Alert, App, Modal, Table } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deletionApi,
  type DirectoryDeletionRequest,
  type DirectoryDeletionRow,
} from '../api/deletion';
import { ErrorState } from './Feedback';
import { Sensitive } from './Sensitive';
import { t as tr } from '../i18n';
import type { ApiError } from '../types';

export function DirectoryDeleteDialog({
  kind,
  request,
  onClose,
  onCompleted,
}: {
  kind: string;
  request: DirectoryDeletionRequest;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const cache = useQueryClient();
  const { message } = App.useApp();
  const [key] = useState(() => crypto.randomUUID());
  const preview = useQuery({
    queryKey: ['directory-deletion-preview', kind, key],
    queryFn: () => deletionApi.directoryPreview(kind, request),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const remove = useMutation({
    mutationFn: () =>
      deletionApi.directories(
        kind,
        preview.data!.items.map(({ id, version }) => ({ id, version })),
        key,
      ),
    onSuccess: (result) => {
      void cache.invalidateQueries();
      message.success(
        tr(
          '已删除 {0} 条，跳过 {1} 条被引用记录',
          result.deleted,
          result.skipped.length,
        ),
      );
      onCompleted();
      onClose();
    },
    onError: (error: ApiError) => {
      message.error(error.message);
    },
  });
  return (
    <Modal
      open
      title={request.all ? tr('全部删除') : tr('批量删除')}
      width={720}
      onCancel={() => !remove.isPending && onClose()}
      maskClosable={false}
      closable={!remove.isPending}
      okText={tr('确认删除')}
      cancelText={tr('取消')}
      confirmLoading={remove.isPending}
      okButtonProps={{
        danger: true,
        disabled:
          preview.isFetching || preview.isError || !preview.data?.allowed,
      }}
      cancelButtonProps={{ disabled: remove.isPending }}
      onOk={() => remove.mutate()}
    >
      <Alert
        className="mb16"
        type="warning"
        showIcon
        message={tr('目录删除不可恢复，历史交易会保留。')}
        description={
          request.all
            ? tr(
                '全部删除涵盖当前类型的所有记录，不受搜索条件和分页限制。被引用的标签或项目会跳过。',
              )
            : tr('仅删除所选记录。被引用的标签或项目会跳过。')
        }
      />
      {preview.isError ? (
        <ErrorState error={preview.error} retry={() => preview.refetch()} />
      ) : (
        <>
          <p>
            {tr(
              '共 {0} 条，可删除 {1} 条，被引用 {2} 条',
              preview.data?.total || 0,
              preview.data?.allowed || 0,
              preview.data?.blocked || 0,
            )}
          </p>
          <Table<DirectoryDeletionRow>
            rowKey="id"
            loading={preview.isFetching}
            dataSource={preview.data?.items}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ y: 300 }}
            columns={[
              {
                title: tr('名称'),
                dataIndex: 'name',
                render: (value) => <Sensitive>{value}</Sensitive>,
              },
              {
                title: tr('删除结果'),
                render: (_, row) =>
                  row.allowed
                    ? tr('可删除')
                    : tr('仍被引用，请先移除引用或改为停用'),
              },
            ]}
          />
        </>
      )}
    </Modal>
  );
}
