import { DatePicker } from '../components/ResponsiveDatePicker';
import { Select } from '../components/TouchSelect';
import { useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Row,
  Skeleton,
  Space,
  Tabs,
  Upload,
} from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { profileApi } from '../api/profile';
import { apiClient } from '../api/client';
import type { ApiResponse } from '../types';
import type { Profile } from '../api/profile';
import type { ApiError } from '../types';
import { UserAvatar } from '../components/UserAvatar';
import { ErrorState } from '../components/Feedback';
import { t as tr, useLocale } from '../i18n';
import { useUI } from '../stores/ui';
import { isValidNewPassword } from '../utils/password';
import { formatProfileDate } from '../utils/profile';
export default function ProfilePage() {
  const language = useLocale();
  const { message } = App.useApp();
  const cache = useQueryClient();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [security] = Form.useForm();
  const [dirty, setDirty] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingVersion, setEditingVersion] = useState<number>();
  const q = useQuery({ queryKey: ['profile'], queryFn: profileApi.get });
  const currencies = useQuery({
    queryKey: ['currency-catalog'],
    queryFn: () =>
      apiClient
        .get<
          ApiResponse<
            { code: string; enabled: boolean; internationalName: string }[]
          >
        >('/currencies')
        .then((r) => r.data.data),
  });
  useEffect(() => {
    if (q.data && !isEditing) {
      form.setFieldsValue({
        ...q.data,
        birthday: q.data.birthday ? dayjs(q.data.birthday) : null,
      });
      setEditingVersion(q.data.version);
    }
  }, [q.data, form, isEditing]);
  const changed = (profile: Profile) => {
    cache.setQueryData(['profile'], profile);
    void cache.invalidateQueries({ queryKey: ['session'] });
  };
  const error = (e: ApiError) => {
    message.error(e.message);
    if (e.code === 'VERSION_CONFLICT') void q.refetch();
  };
  const save = useMutation({
    mutationFn: (values: Profile) =>
      profileApi.save({
        ...q.data!,
        ...values,
        version: editingVersion!,
        birthday: values.birthday
          ? dayjs(values.birthday).format('YYYY-MM-DD')
          : null,
      }),
    onSuccess: (profile) => {
      setDirty(false);
      setIsEditing(false);
      changed(profile);
      useUI.getState().setLanguage(profile.language);
      message.success(tr('资料已保存'));
    },
    onError: error,
  });
  const avatar = useMutation({
    mutationFn: (file: File) => profileApi.upload(file, q.data!.version),
    onSuccess: (p) => {
      setEditingVersion((previous) =>
        previous === p.version - 1 ? p.version : previous,
      );
      changed(p);
      message.success(tr('头像已更新'));
    },
    onError: error,
  });
  const remove = useMutation({
    mutationFn: () => profileApi.remove(q.data!.version),
    onSuccess: (p) => {
      setEditingVersion((previous) =>
        previous === p.version - 1 ? p.version : previous,
      );
      changed(p);
      message.success(tr('头像已移除'));
    },
    onError: error,
  });
  const password = useMutation({
    mutationFn: (v: { currentPassword: string; newPassword: string }) =>
      profileApi.password(v),
    onSuccess: () => {
      security.resetFields();
      cache.clear();
      useUI.getState().closeEntry();
      message.success(tr('密码已修改，请重新登录'));
      navigate('/login', { replace: true });
    },
    onError: error,
  });
  if (q.isPending) return <Skeleton active />;
  if (q.isError)
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const p = q.data;
  const profileBusy = save.isPending || avatar.isPending || remove.isPending;
  const resetProfileForm = () => {
    form.resetFields();
    form.setFieldsValue({
      ...p,
      birthday: p.birthday ? dayjs(p.birthday) : null,
    });
    setEditingVersion(p.version);
    setDirty(false);
  };
  const beginEdit = () => {
    resetProfileForm();
    setIsEditing(true);
  };
  const cancelEdit = () => {
    resetProfileForm();
    setIsEditing(false);
  };

  const field = (name: string, label: string) => (
    <Col xs={24} md={12}>
      <Form.Item name={name} label={tr(label)} rules={[{ max: 100 }]}>
        <Input maxLength={100} />
      </Form.Item>
    </Col>
  );
  return (
    <div className="profile-center">
      <div className="page-heading">
        <div>
          <h1>{tr('个人信息中心')}</h1>
          <p className="muted">{p.displayName}</p>
        </div>
        <Space wrap>
          {isEditing ? (
            <>
              <Button disabled={profileBusy} onClick={cancelEdit}>
                {tr('取消修改')}
              </Button>
              <Button
                type="primary"
                loading={save.isPending}
                disabled={
                  avatar.isPending ||
                  remove.isPending ||
                  editingVersion === undefined
                }
                onClick={() => form.submit()}
              >
                {tr('保存资料')}
              </Button>
            </>
          ) : (
            <Button type="primary" onClick={beginEdit}>
              {tr('修改信息')}
            </Button>
          )}
        </Space>
      </div>
      <Card className="mb16">
        <Space wrap align="center">
          <UserAvatar
            userId={p.id}
            name={p.displayName}
            updatedAt={p.avatarUpdatedAt}
            size={80}
          />
          <div>
            <Space wrap>
              <Upload
                accept="image/png,image/jpeg"
                disabled={!isEditing || profileBusy}
                showUploadList={false}
                beforeUpload={(file) => {
                  if (!isEditing || profileBusy) return false;
                  if (
                    !['image/png', 'image/jpeg'].includes(file.type) ||
                    file.size > 2097152
                  ) {
                    message.error(tr('请选择PNG或JPEG图片，且不超过2MB'));
                    return false;
                  }
                  avatar.mutate(file);
                  return false;
                }}
              >
                <Button
                  loading={avatar.isPending}
                  disabled={!isEditing || profileBusy}
                >
                  {tr('上传头像')}
                </Button>
              </Upload>
              <Button
                danger
                disabled={!isEditing || !p.hasAvatar || profileBusy}
                loading={remove.isPending}
                onClick={() => {
                  if (isEditing && !profileBusy) remove.mutate();
                }}
              >
                {tr('移除头像')}
              </Button>
            </Space>
          </div>
        </Space>
      </Card>
      <Tabs
        items={[
          {
            key: 'details',
            label: tr('基本资料'),
            children: (
              <Card>
                <Descriptions
                  column={{ xs: 1, md: 2 }}
                  items={[
                    { key: 'email', label: tr('邮箱'), children: p.email },
                    {
                      key: 'created',
                      label: tr('注册日期'),
                      children: formatProfileDate(
                        p.createdAt,
                        language,
                        p.timeZone,
                      ),
                    },
                    { key: 'id', label: tr('用户编号'), children: p.id },
                  ]}
                />
                {dirty && editingVersion !== p.version && (
                  <Alert
                    className="mb16"
                    type="warning"
                    message={tr('资料有新版本。请复制未保存内容，再重新加载。')}
                    action={
                      <Button onClick={resetProfileForm}>
                        {tr('重新加载资料')}
                      </Button>
                    }
                  />
                )}
                <Form
                  form={form}
                  layout="vertical"
                  disabled={!isEditing || profileBusy}
                  onFinish={(values) => {
                    if (isEditing && !profileBusy) save.mutate(values);
                  }}
                  onValuesChange={() => setDirty(true)}
                >
                  <Row gutter={20}>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="displayName"
                        label={tr('显示名称')}
                        rules={[
                          {
                            required: true,
                            whitespace: true,
                            message: tr('请输入显示名称'),
                          },
                          { max: 100 },
                        ]}
                      >
                        <Input autoComplete="nickname" maxLength={100} />
                      </Form.Item>
                    </Col>
                    {field('realName', '真实姓名')}
                    {field('phone', '手机号')}
                    <Col xs={24} md={12}>
                      <Form.Item name="birthday" label={tr('出生日期')}>
                        <DatePicker
                          style={{ width: '100%' }}
                          disabledDate={(date) =>
                            date.isAfter(dayjs(), 'day') || date.year() < 1900
                          }
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="gender" label={tr('性别')}>
                        <Select
                          options={[
                            'Unspecified',
                            'Female',
                            'Male',
                            'Other',
                          ].map((value, i) => ({
                            value,
                            label: tr(['未指定', '女', '男', '其他'][i]),
                          }))}
                        />
                      </Form.Item>
                    </Col>
                    {field('country', '国家或地区')}
                    {field('region', '省或地区')}
                    {field('city', '城市')}
                    {field('occupation', '职业')}
                    <Col span={24}>
                      <Form.Item
                        name="bio"
                        label={tr('个人简介')}
                        rules={[{ max: 1000 }]}
                      >
                        <Input.TextArea rows={3} maxLength={1000} showCount />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name="language" label={tr('语言')}>
                        <Select
                          options={[
                            { value: 'zh-CN', label: tr('简体中文') },
                            { value: 'en', label: 'English' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="timeZone"
                        label={tr('时区')}
                        rules={[{ required: true }]}
                      >
                        <Select
                          showSearch
                          options={[
                            'Asia/Shanghai',
                            'Asia/Hong_Kong',
                            'Asia/Tokyo',
                            'Asia/Singapore',
                            'Europe/London',
                            'Europe/Paris',
                            'America/New_York',
                            'America/Los_Angeles',
                            'Australia/Sydney',
                            'UTC',
                            p.timeZone,
                          ]
                            .filter((v, i, a) => a.indexOf(v) === i)
                            .map((value) => ({ value, label: value }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name="preferredCurrency"
                        label={tr('偏好币种')}
                      >
                        <Select
                          options={currencies.data
                            ?.filter((c) => c.enabled)
                            .map((c) => ({ value: c.code, label: c.code }))}
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
              </Card>
            ),
          },
          {
            key: 'security',
            label: tr('账户安全'),
            children: (
              <Card>
                <Form
                  form={security}
                  layout="vertical"
                  disabled={password.isPending}
                  onFinish={password.mutate}
                  style={{ maxWidth: 480 }}
                >
                  <Form.Item
                    name="currentPassword"
                    label={tr('当前密码')}
                    rules={[{ required: true, message: tr('请输入密码') }]}
                  >
                    <Input.Password autoComplete="current-password" />
                  </Form.Item>
                  <Form.Item
                    name="newPassword"
                    label={tr('新密码')}
                    rules={[
                      { required: true },
                      {
                        validator: (_, value: string) =>
                          !value || isValidNewPassword(value)
                            ? Promise.resolve()
                            : Promise.reject(
                                new Error(
                                  tr('密码至少12个字符，并包含字母和数字'),
                                ),
                              ),
                      },
                    ]}
                  >
                    <Input.Password
                      autoComplete="new-password"
                      maxLength={128}
                    />
                  </Form.Item>
                  <Form.Item
                    name="confirm"
                    label={tr('确认密码')}
                    dependencies={['newPassword']}
                    rules={[
                      { required: true },
                      ({ getFieldValue }) => ({
                        validator: (_, v) =>
                          v === getFieldValue('newPassword')
                            ? Promise.resolve()
                            : Promise.reject(new Error(tr('两次密码不一致'))),
                      }),
                    ]}
                  >
                    <Input.Password
                      autoComplete="new-password"
                      maxLength={128}
                    />
                  </Form.Item>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={password.isPending}
                  >
                    {tr('修改密码')}
                  </Button>
                </Form>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
