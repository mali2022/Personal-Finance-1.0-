import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Drawer,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Select } from '../../components/TouchSelect';
import { Sensitive } from '../../components/Sensitive';
import { ErrorState } from '../../components/Feedback';
import { useLocale } from '../../i18n';
import {
  merchantMasterApi,
  type MerchantMaster,
  type MergePreview,
} from './api412';

export function MerchantMasterPanel() {
  const en = useLocale() === 'en';
  const t = (zh: string, english: string) => (en ? english : zh);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [aliasFor, setAliasFor] = useState<MerchantMaster>();
  const [name, setName] = useState('');
  const [source, setSource] = useState<MerchantMaster>();
  const [target, setTarget] = useState<MerchantMaster>();
  const [targetKeyword, setTargetKeyword] = useState('');
  const [preview, setPreview] = useState<MergePreview>();
  const { message } = App.useApp();
  const cache = useQueryClient();
  const list = useQuery({
    queryKey: ['merchant-master', keyword, page],
    queryFn: () => merchantMasterApi.list(page, keyword),
    enabled: open,
  });
  const targets = useQuery({
    queryKey: ['merchant-master-targets', targetKeyword],
    queryFn: () => merchantMasterApi.list(1, targetKeyword, 100),
    enabled: !!source,
  });
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ['merchant-master'] });
    void cache.invalidateQueries({ queryKey: ['merchant-master-targets'] });
    void cache.invalidateQueries({ queryKey: ['directory', 'merchants'] });
    void cache.invalidateQueries({ queryKey: ['transactions'] });
  };
  const error = (e: Error) => message.error(e.message);
  const add = useMutation({
    mutationFn: () =>
      merchantMasterApi.alias(aliasFor!.id, name, aliasFor!.version),
    onSuccess: () => {
      refresh();
      setAliasFor(undefined);
      setName('');
      message.success(t('别名已保存', 'Alias saved'));
    },
    onError: error,
  });
  const remove = useMutation({
    mutationFn: (alias: { id: string; version: string }) =>
      merchantMasterApi.removeAlias(alias.id, alias.version),
    onSuccess: refresh,
    onError: error,
  });
  const inspect = useMutation({
    mutationFn: () =>
      merchantMasterApi.preview(
        source!.id,
        target!.id,
        source!.version,
        target!.version,
      ),
    onSuccess: setPreview,
    onError: error,
  });
  const merge = useMutation({
    mutationFn: () =>
      merchantMasterApi.merge(
        source!.id,
        target!.id,
        source!.version,
        target!.version,
        preview!.previewToken,
      ),
    onSuccess: () => {
      refresh();
      setSource(undefined);
      setTarget(undefined);
      setPreview(undefined);
      message.success(
        t(
          '商户已合并，账务金额不变',
          'Merchants merged; financial amounts unchanged',
        ),
      );
    },
    onError: error,
  });
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        {t('商户主数据与别名', 'Merchant master & aliases')}
      </Button>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        width={1000}
        title={t('统一商户名称与主数据', 'Merchant names & master data')}
      >
        <Input.Search
          aria-label={t('搜索标准名或别名', 'Search names or aliases')}
          placeholder={t('搜索标准名或别名', 'Search names or aliases')}
          onSearch={(v) => {
            setKeyword(v);
            setPage(1);
          }}
          allowClear
          style={{ maxWidth: 400, marginBottom: 16 }}
        />
        {list.isError ? (
          <ErrorState error={list.error} retry={() => void list.refetch()} />
        ) : (
          <Table<MerchantMaster>
            rowKey="id"
            loading={list.isPending}
            dataSource={list.data?.items}
            scroll={{ x: 700 }}
            pagination={{
              current: page,
              pageSize: 20,
              total: list.data?.total,
              onChange: setPage,
              showSizeChanger: false,
            }}
            columns={[
              {
                title: t('标准名称', 'Standard name'),
                render: (_, r) => <Sensitive>{r.name}</Sensitive>,
              },
              {
                title: t('状态', 'Status'),
                render: (_, r) => (
                  <Tag>
                    {r.status === 'Active'
                      ? t('启用', 'Active')
                      : t('停用', 'Disabled')}
                  </Tag>
                ),
              },
              {
                title: t('别名', 'Aliases'),
                render: (_, r) => (
                  <Space wrap>
                    {r.aliases.map((a) => (
                      <Tag key={a.id}>
                        <Sensitive>{a.name}</Sensitive>
                        <Popconfirm
                          title={t('移除此别名匹配？', 'Remove this alias?')}
                          onConfirm={() => remove.mutateAsync(a)}
                        >
                          <Button
                            type="link"
                            size="small"
                            disabled={remove.isPending}
                          >
                            {t('移除', 'Remove')}
                          </Button>
                        </Popconfirm>
                      </Tag>
                    ))}
                  </Space>
                ),
              },
              {
                title: t('操作', 'Actions'),
                render: (_, r) =>
                  r.status === 'Active' ? (
                    <Space wrap>
                      <Button
                        onClick={() => {
                          setAliasFor(r);
                          setName('');
                        }}
                      >
                        {t('添加别名', 'Add alias')}
                      </Button>
                      <Button
                        onClick={() => {
                          setSource(r);
                          setTarget(undefined);
                          setPreview(undefined);
                        }}
                      >
                        {t('合并到…', 'Merge into…')}
                      </Button>
                    </Space>
                  ) : (
                    '—'
                  ),
              },
            ]}
          />
        )}
      </Drawer>
      <Modal
        open={!!aliasFor}
        title={t('添加明确商户别名', 'Add an explicit alias')}
        okText={t('保存别名', 'Save alias')}
        cancelText={t('取消', 'Cancel')}
        onCancel={() => setAliasFor(undefined)}
        onOk={() => add.mutate()}
        okButtonProps={{ disabled: !name.trim() }}
        confirmLoading={add.isPending}
      >
        <p>
          <Sensitive>{aliasFor?.name}</Sensitive>
        </p>
        <Input
          aria-label={t('商户别名', 'Merchant alias')}
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          placeholder={t(
            '账单中出现的商户名称',
            'Merchant text shown on a bill',
          )}
        />
      </Modal>
      <Modal
        open={!!source}
        title={t('预览并确认商户合并', 'Preview and confirm merchant merge')}
        onCancel={() => {
          setSource(undefined);
          setPreview(undefined);
        }}
        footer={
          <Space>
            <Button onClick={() => setSource(undefined)}>
              {t('取消', 'Cancel')}
            </Button>
            <Button
              disabled={!target || inspect.isPending || merge.isPending}
              loading={inspect.isPending}
              onClick={() => inspect.mutate()}
            >
              {t('预览影响范围', 'Preview impact')}
            </Button>
            <Popconfirm
              title={t(
                '确认统一名称并停用来源商户？',
                'Merge and disable the source merchant?',
              )}
              onConfirm={() => merge.mutateAsync()}
              disabled={!preview}
            >
              <Button
                type="primary"
                disabled={!preview || merge.isPending}
                loading={merge.isPending}
              >
                {t('确认合并', 'Confirm merge')}
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        <p>
          {t('来源标准名称', 'Source name')}:{' '}
          <Sensitive>{source?.name}</Sensitive>
        </p>
        <Select
          aria-label={t('目标商户', 'Target merchant')}
          showSearch
          filterOption={false}
          onSearch={setTargetKeyword}
          value={target?.id}
          placeholder={t(
            '搜索并选择保留的标准商户',
            'Search for the master to retain',
          )}
          style={{ width: '100%' }}
          options={targets.data?.items
            .filter((x) => x.id !== source?.id && x.status === 'Active')
            .map((x) => ({ value: x.id, label: x.name }))}
          onChange={(id) => {
            setTarget(targets.data?.items.find((x) => x.id === id));
            setPreview(undefined);
          }}
        />
        {targets.isError && (
          <ErrorState
            error={targets.error}
            retry={() => void targets.refetch()}
          />
        )}
        {preview && (
          <Alert
            style={{ marginTop: 16 }}
            type="warning"
            message={t(
              `将更新 ${preview.transactions} 笔交易名称，迁移 ${preview.aliases} 个别名，并停用来源商户。`,
              `Updates ${preview.transactions} transaction names, moves ${preview.aliases} aliases and disables the source.`,
            )}
            description={t(
              '金额、账户、分类及分录不变。操作记录可追溯，确认前请核对是否为同一商户。',
              'Amounts, accounts, categories and ledger entries stay unchanged. The operation is audited; confirm these are the same merchant.',
            )}
          />
        )}
      </Modal>
    </>
  );
}
