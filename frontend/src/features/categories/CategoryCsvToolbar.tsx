import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Upload,
} from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import {
  categoryApi,
  type CategoryBatchDeletionPreview,
  type CategoryImportPreview,
} from '../../api/finance';
import type { ApiError, Category } from '../../types';
import { Sensitive } from '../../components/Sensitive';
import { t as tr } from '../../i18n';
import {
  CATEGORY_CSV_MAX_BYTES,
  categoryCsvFileName,
  categoryCsvTemplate,
  categoryKindLabel,
  categoryTemplateFileName,
  exportCategoryCsv,
  parseCategoryCsv,
  type CategoryCsvRow,
  type CategoryKind,
} from './categoryCsv';

function downloadCsv(text: string, fileName: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function CategoryCsvToolbar({
  kind,
  categories,
}: {
  kind: CategoryKind;
  categories: Category[];
}) {
  const { message } = App.useApp();
  const cache = useQueryClient();
  const scoped = categories.filter((category) => category.kind === kind);
  const [busy, setBusy] = useState(false);
  const [importRows, setImportRows] = useState<CategoryCsvRow[]>();
  const [importPreview, setImportPreview] = useState<CategoryImportPreview>();
  const [importKey, setImportKey] = useState('');
  const [deletePreview, setDeletePreview] =
    useState<CategoryBatchDeletionPreview>();
  const [deleteKey, setDeleteKey] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const deleteConfirmation = tr('删除全部{0}', categoryKindLabel(kind));
  const refresh = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ['categories'] }),
      cache.invalidateQueries({ queryKey: ['categoryOverview'] }),
    ]);
  const closeImport = () => {
    if (busy) return;
    setImportRows(undefined);
    setImportPreview(undefined);
  };
  const closeDelete = () => {
    if (busy) return;
    setDeletePreview(undefined);
    setConfirmation('');
  };
  return (
    <>
      <Upload
        accept=".csv,text/csv"
        showUploadList={false}
        beforeUpload={async (file) => {
          if (busy) return false;
          try {
            if (file.size > CATEGORY_CSV_MAX_BYTES)
              throw new Error(tr('CSV不能超过2MB'));
            const rows = parseCategoryCsv(await file.text());
            setBusy(true);
            const preview = await categoryApi.importPreview({ kind, rows });
            setImportRows(rows);
            setImportPreview(preview);
            setImportKey(crypto.randomUUID());
          } catch (error) {
            message.error((error as Error).message);
          } finally {
            setBusy(false);
          }
          return false;
        }}
      >
        <Button disabled={busy}>{tr('导入CSV')}</Button>
      </Upload>
      <Button
        disabled={!scoped.length || busy}
        onClick={() =>
          downloadCsv(
            exportCategoryCsv(categories, kind),
            categoryCsvFileName(kind),
          )
        }
      >
        {tr('导出CSV')}
      </Button>
      <Button
        onClick={() =>
          downloadCsv(categoryCsvTemplate(kind), categoryTemplateFileName(kind))
        }
      >
        {tr('导入模板')}
      </Button>
      <Button
        danger
        disabled={!scoped.length || busy}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const preview = await categoryApi.batchDeletionPreview(kind);
            setDeletePreview(preview);
            setDeleteKey(crypto.randomUUID());
            setConfirmation('');
          } catch (error) {
            message.error((error as ApiError).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {tr('全部删除')}
      </Button>
      <Modal
        title={tr('预览分类导入')}
        open={!!importPreview}
        width={720}
        onCancel={closeImport}
        confirmLoading={busy}
        okText={tr('确认导入')}
        cancelText={tr('取消')}
        onOk={async () => {
          if (!importRows || !importPreview || !importPreview.ready || busy)
            return;
          setBusy(true);
          try {
            const result = await categoryApi.importCategories(
              { kind, rows: importRows },
              importKey,
            );
            setImportRows(undefined);
            setImportPreview(undefined);
            await refresh();
            message.success(
              tr(
                '已导入 {0} 条分类，跳过 {1} 条',
                result.imported,
                result.skipped.length,
              ),
            );
          } catch (error) {
            message.error((error as ApiError).message);
          } finally {
            setBusy(false);
          }
        }}
        okButtonProps={{ disabled: !importPreview?.ready }}
      >
        <Table
          rowKey="row"
          scroll={{ x: 620 }}
          dataSource={importPreview?.items}
          pagination={{ pageSize: 8 }}
          columns={[
            { title: tr('行号'), dataIndex: 'row', width: 70 },
            {
              title: tr('分类名称'),
              dataIndex: 'name',
              render: (name: string) => <Sensitive>{name}</Sensitive>,
            },
            {
              title: tr('父级分类'),
              dataIndex: 'parentPath',
              render: (path: string) => path || '—',
            },
            {
              title: tr('状态'),
              dataIndex: 'status',
              render: (status: string) => status || tr('启用'),
            },
            {
              title: tr('结果'),
              render: (_, item) =>
                item.state === 'Ready' ? (
                  <Tag color="green">{tr('可导入')}</Tag>
                ) : item.state === 'Duplicate' ? (
                  <Tag color="orange">{tr('同名分类已存在')}</Tag>
                ) : (
                  <Tag color="red">
                    {tr('错误原因：{0}', item.reason || '')}
                  </Tag>
                ),
            },
          ]}
        />
      </Modal>
      <Modal
        title={tr('全部删除{0}', categoryKindLabel(kind))}
        open={!!deletePreview}
        width={720}
        onCancel={closeDelete}
        confirmLoading={busy}
        okText={tr('确认删除')}
        cancelText={tr('取消')}
        onOk={async () => {
          if (!deletePreview || busy || confirmation !== deleteConfirmation)
            return;
          setBusy(true);
          try {
            const result = await categoryApi.batchDelete(
              {
                kind,
                items: deletePreview.items.map(({ id, version }) => ({
                  id,
                  version,
                })),
              },
              deleteKey,
            );
            setDeletePreview(undefined);
            setConfirmation('');
            await refresh();
            message.success(
              tr(
                '已删除 {0} 条、保留 {1} 条',
                result.deleted,
                result.skipped.length,
              ),
            );
          } catch (error) {
            message.error((error as ApiError).message);
          } finally {
            setBusy(false);
          }
        }}
        okButtonProps={{
          danger: true,
          disabled:
            !deletePreview?.items.length || confirmation !== deleteConfirmation,
        }}
      >
        <Alert
          type="warning"
          message={tr(
            '将尝试删除全部{0}，共 {1} 个；其中 {2} 个可删除、{3} 个将保留。',
            categoryKindLabel(kind),
            deletePreview?.total ?? 0,
            deletePreview?.allowed ?? 0,
            deletePreview?.blocked ?? 0,
          )}
        />
        <Table
          rowKey="id"
          scroll={{ x: 520 }}
          dataSource={deletePreview?.items}
          pagination={{ pageSize: 8 }}
          columns={[
            {
              title: tr('分类名称'),
              dataIndex: 'name',
              render: (name: string) => <Sensitive>{name}</Sensitive>,
            },
            {
              title: tr('层级'),
              dataIndex: 'depth',
              render: (depth: number) => tr('{0}级分类', depth),
            },
            {
              title: tr('结果'),
              render: (_, item) =>
                item.allowed ? (
                  <Tag color="green">{tr('可删除')}</Tag>
                ) : (
                  <Tag color="red">
                    {tr('保留：{0}', item.reason || tr('存在引用'))}
                  </Tag>
                ),
            },
          ]}
        />
        <Space direction="vertical" className="mt16">
          <span>{tr('请输入“{0}”确认', deleteConfirmation)}</span>
          <Input
            aria-label={tr('全部删除分类确认')}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </Space>
      </Modal>
    </>
  );
}
