import { Select } from '../../components/TouchSelect';
import { t as tr, useLocale } from '../../i18n';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Form, Input, Modal, Space } from 'antd';
import { authApi } from '../../api/client';
import {
  readDefaultView,
  setDefaultView,
  deleteView,
  normalizeViewQuery,
  readViews,
  saveView,
  transactionColumns,
  visibleColumns,
} from './savedViews';
export function SavedViewPicker({
  params,
  onApply,
}: {
  params: URLSearchParams;
  onApply: (query: URLSearchParams) => void;
}) {
  useLocale();
  const { data: user } = useQuery({
    queryKey: ['session'],
    queryFn: authApi.me,
    staleTime: Infinity,
  });
  const { message, modal } = App.useApp();
  const applied = useRef<string | undefined>(undefined);
  const [copying, setCopying] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [, setRevision] = useState(0);
  const [form] = Form.useForm<{ name: string }>();
  let failure: string | undefined;
  let views: ReturnType<typeof readViews> = [];
  try {
    if (user) views = readViews(user.id);
  } catch {
    failure =
      '无法读取本地筛选视图。原数据保留，请检查浏览器存储权限或数据格式。';
  }
  useEffect(() => {
    if (!user || applied.current === user.id) return;
    applied.current = user.id;
    try {
      if (!params.toString()) {
        const view = readViews(user.id).find(
          (v) => v.id === readDefaultView(user.id),
        );
        const next = new URLSearchParams(
          view ? normalizeViewQuery(new URLSearchParams(view.query)) : '',
        );
        const columns = localStorage.getItem(
          'finance-transaction-columns:' + user.id,
        );
        if (columns && !next.has('columns'))
          next.set('columns', visibleColumns(columns).join(','));
        if (next.toString()) {
          onApply(next);
          if (view) setSelected(view.id);
        }
      }
    } catch {
      message.warning(tr('默认视图读取失败，原数据已保留。'));
    }
  }, [user, params, onApply, message]);
  return (
    <>
      {failure && (
        <Alert className="mb16" type="warning" showIcon message={failure} />
      )}
      <Space wrap className="mb16 workspace-saved-views">
        <Select
          aria-label={tr('已保存筛选视图')}
          placeholder={tr('选择已保存视图')}
          allowClear
          style={{ minWidth: 190 }}
          value={selected}
          options={views.map((v) => ({ value: v.id, label: v.name }))}
          onChange={(id) => {
            const view = views.find((v) => v.id === id);
            if (view) {
              try {
                onApply(
                  new URLSearchParams(
                    normalizeViewQuery(new URLSearchParams(view.query)),
                  ),
                );
                setSelected(id);
              } catch {
                message.error(tr('视图无法应用，请检查保存内容。'));
              }
            } else setSelected(undefined);
          }}
        />
        <Button
          disabled={!user || !!failure}
          onClick={() => {
            setCopying(undefined);
            form.resetFields();
            setEditing(true);
          }}
        >
          {tr('保存当前筛选')}
        </Button>
        <details className="workspace-view-actions">
          <summary>{tr('管理视图')}</summary>
          <Space wrap>
            <Button
              disabled={!selected || !!failure}
              onClick={() =>
                modal.confirm({
                  title: tr('删除这个筛选视图？'),
                  content: tr('只删除当前浏览器中的收藏，不影响交易或账户。'),
                  onOk: () => {
                    try {
                      if (user && selected) {
                        deleteView(user.id, selected);
                        setSelected(undefined);
                        setRevision((n) => n + 1);
                        message.success(tr('筛选视图已删除'));
                      }
                    } catch {
                      message.error(tr('删除失败，请检查浏览器存储权限。'));
                      return Promise.reject(new Error('无法保存本地设置'));
                    }
                  },
                })
              }
            >
              {tr('删除视图')}
            </Button>
            <Button
              disabled={!selected || !user || !!failure}
              onClick={() => {
                const view = views.find((v) => v.id === selected);
                if (view) {
                  setCopying(view.query);
                  form.setFieldsValue({ name: view.name + ' ' + tr('副本') });
                  setEditing(true);
                }
              }}
            >
              {tr('复制视图')}
            </Button>
            <Button
              disabled={!selected || !user || !!failure}
              onClick={() => {
                try {
                  if (user && selected) {
                    setDefaultView(user.id, selected);
                    message.success(tr('已设为默认视图'));
                  }
                } catch {
                  message.error(tr('默认视图保存失败'));
                }
              }}
            >
              {tr('设为默认视图')}
            </Button>
            <Button
              disabled={!user}
              onClick={() => {
                try {
                  if (user) setDefaultView(user.id);
                  message.success(tr('已取消默认视图'));
                } catch {
                  message.error(tr('默认视图保存失败'));
                }
              }}
            >
              {tr('取消默认视图')}
            </Button>
          </Space>
        </details>
        <Select
          aria-label={tr('显示字段')}
          mode="multiple"
          maxTagCount={1}
          style={{ minWidth: 190, maxWidth: '100%' }}
          value={visibleColumns(params.get('columns'))}
          options={transactionColumns.map(([value, label]) => ({
            value,
            label,
            disabled: ['date', 'type', 'amount', 'actions'].includes(value),
          }))}
          onChange={(keys) => {
            const next = new URLSearchParams(params);
            next.set('columns', visibleColumns(keys.join(',')).join(','));
            try {
              if (user)
                localStorage.setItem(
                  'finance-transaction-columns:' + user.id,
                  next.get('columns')!,
                );
              onApply(next);
            } catch {
              message.error(tr('无法保存表格配置，请检查浏览器存储权限。'));
            }
          }}
        />
      </Space>
      <Modal
        title={tr('保存筛选视图')}
        open={editing}
        confirmLoading={busy}
        onCancel={() => {
          if (form.isFieldsTouched())
            modal.confirm({
              title: tr('放弃未保存的视图名称？'),
              onOk: () => setEditing(false),
            });
          else setEditing(false);
        }}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <p>
          {tr(
            '筛选、排序和显示字段保存在当前浏览器，按登录用户区分。日期保存为具体范围，分页从第1页开始；不随数据库备份，也不会修改账本。',
          )}
        </p>
        <Form
          form={form}
          layout="vertical"
          onFinish={({ name }) => {
            if (!user || busy) return;
            setBusy(true);
            try {
              const created = saveView(
                user.id,
                name,
                copying !== undefined ? new URLSearchParams(copying) : params,
              );
              setSelected(created.at(-1)?.id);
              setRevision((n) => n + 1);
              setEditing(false);
              message.success(tr('筛选视图已保存'));
            } catch (error) {
              message.error(
                error instanceof Error
                  ? error.message
                  : tr('保存失败，请检查浏览器存储权限。'),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="name"
            label={tr('视图名称')}
            rules={[
              {
                required: true,
                whitespace: true,
                message: tr('请输入视图名称'),
              },
              { max: 60 },
            ]}
          >
            <Input
              autoFocus
              maxLength={60}
              placeholder={tr('例如：本月餐饮')}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
