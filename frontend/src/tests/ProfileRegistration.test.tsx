import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from '../pages/ProfilePage';
import RegisterPage from '../pages/RegisterPage';
import { profileApi, type Profile } from '../api/profile';
import { authApi } from '../api/client';
import { useUI } from '../stores/ui';
import { isValidNewPassword } from '../utils/password';

const profile: Profile = {
  id: 'profile-user',
  email: 'profile@example.com',
  displayName: '个人用户',
  realName: '',
  phone: '',
  birthday: null,
  gender: 'Unspecified',
  country: '',
  region: '',
  city: '',
  occupation: '',
  bio: '',
  language: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  preferredCurrency: 'CNY',
  createdAt: '2026-10-12T00:00:00Z',
  version: 1,
  hasAvatar: false,
  avatarUpdatedAt: null,
};
function mount(
  element: React.ReactNode,
  seedProfile = false,
  initialProfile = profile,
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  if (seedProfile) {
    client.setQueryData(['profile'], initialProfile);
    client.setQueryData(
      ['currency-catalog'],
      [{ code: 'CNY', enabled: true, internationalName: 'Chinese Yuan' }],
    );
  }
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <App>{element}</App>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => useUI.setState({ language: 'zh-CN', hidden: false }));
afterEach(() => vi.restoreAllMocks());

describe('个人资料与注册请求状态', () => {
  it('defaults to read-only and requires Edit before changing profile or avatar', async () => {
    const save = vi.spyOn(profileApi, 'save');
    const upload = vi.spyOn(profileApi, 'upload');
    mount(<ProfilePage />, true);
    await waitFor(() =>
      expect(screen.getByLabelText('显示名称')).toHaveValue(
        profile.displayName,
      ),
    );
    expect(screen.getByLabelText('真实姓名')).toBeDisabled();
    expect(screen.getByRole('button', { name: '上传头像' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: '保存资料' }),
    ).not.toBeInTheDocument();
    fireEvent.submit(screen.getByLabelText('显示名称').closest('form')!);
    expect(save).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '修改信息' }));
    expect(screen.getByLabelText('真实姓名')).toBeEnabled();
    expect(screen.getByRole('button', { name: '上传头像' })).toBeEnabled();
  });
  it('cancels unsaved values and returns to read-only without a write', async () => {
    const save = vi.spyOn(profileApi, 'save');
    mount(<ProfilePage />, true);
    await waitFor(() =>
      expect(screen.getByLabelText('显示名称')).toHaveValue(
        profile.displayName,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: '修改信息' }));
    fireEvent.change(screen.getByLabelText('真实姓名'), {
      target: { value: '未保存草稿' },
    });
    fireEvent.click(screen.getByRole('button', { name: '取消修改' }));
    expect(screen.getByLabelText('真实姓名')).toBeDisabled();
    expect(screen.getByLabelText('真实姓名')).toHaveValue('');
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '修改信息' }));
    expect(screen.getByLabelText('真实姓名')).toHaveValue('');
  });
  it('keeps the opened version while a background refresh arrives', async () => {
    const save = vi
      .spyOn(profileApi, 'save')
      .mockRejectedValue({ code: 'VERSION_CONFLICT', message: '资料有新版本' });
    const cache = mount(<ProfilePage />, true);
    await waitFor(() =>
      expect(screen.getByLabelText('显示名称')).toHaveValue(
        profile.displayName,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: '修改信息' }));
    act(() =>
      cache.setQueryData(['profile'], {
        ...profile,
        realName: '远端更新',
        version: 2,
      }),
    );
    fireEvent.change(screen.getByLabelText('真实姓名'), {
      target: { value: '本地草稿' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存资料' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ realName: '本地草稿', version: 1 }),
      ),
    );
  });

  it('旧后端返回浏览器不支持的时区时资料页仍可使用，并标明UTC回退', async () => {
    mount(<ProfilePage />, true, {
      ...profile,
      timeZone: 'China Standard Time',
    });
    expect(screen.getByRole('heading', { name: '个人信息中心' })).toBeVisible();
    expect(screen.getByText('2026/10/12 (UTC)')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByLabelText('显示名称')).toHaveValue(
        profile.displayName,
      ),
    );
  });
  it('注册能力加载失败显示错误并支持重试，而不是无解释地禁用注册', async () => {
    const options = vi
      .spyOn(authApi, 'options')
      .mockRejectedValueOnce({
        code: 'ENDPOINT_UNAVAILABLE',
        message: '注册能力暂不可用',
      })
      .mockResolvedValue({ registrationEnabled: true });
    mount(<RegisterPage />);
    expect(await screen.findByText('注册能力暂不可用')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /^重\s*试$/ }));
    expect(
      await screen.findByRole('button', { name: '创建账户' }),
    ).toBeEnabled();
    expect(options).toHaveBeenCalledTimes(2);
  });

  it('保存期间禁止继续编辑或修改头像，成功后展示已确认的资料', async () => {
    let complete: (result: Profile) => void = () => {};
    const pending = new Promise<Profile>((resolve) => {
      complete = resolve;
    });
    const save = vi.spyOn(profileApi, 'save').mockReturnValue(pending);
    mount(<ProfilePage />, true);
    await waitFor(() =>
      expect(screen.getByLabelText('显示名称')).toHaveValue(
        profile.displayName,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: '修改信息' }));
    fireEvent.change(screen.getByLabelText('真实姓名'), {
      target: { value: '已提交姓名' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存资料' }));
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('真实姓名')).toBeDisabled();
    expect(screen.getByRole('button', { name: '上传头像' })).toBeDisabled();
    await act(async () =>
      complete({ ...profile, realName: '已提交姓名', version: 2 }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('真实姓名')).toBeDisabled(),
    );
    expect(screen.getByRole('button', { name: '修改信息' })).toBeEnabled();
    expect(screen.getByLabelText('真实姓名')).toHaveValue('已提交姓名');
  });

  it('保存失败保留编辑内容并重新允许编辑', async () => {
    vi.spyOn(profileApi, 'save').mockRejectedValue({
      code: 'NETWORK_ERROR',
      message: '网络暂不可用',
    });
    mount(<ProfilePage />, true);
    await waitFor(() =>
      expect(screen.getByLabelText('显示名称')).toHaveValue(
        profile.displayName,
      ),
    );
    fireEvent.click(screen.getByRole('button',{name:'修改信息'}));
    fireEvent.change(screen.getByLabelText('真实姓名'), {
      target: { value: '未保存姓名' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存资料' }));
    expect(await screen.findByText('网络暂不可用')).toBeVisible();
    expect(screen.getByLabelText('真实姓名')).toBeEnabled();
    expect(screen.getByLabelText('真实姓名')).toHaveValue('未保存姓名');
  });
});

describe('新密码与服务端规则一致', () => {
  it.each([
    '中文个人密码长度十二位123',
    'English１２３４５６７８９',
    'ValidPassword123',
    'Line\nPassword123',
  ])('接受服务端允许的密码格式 %s', (password) => {
    expect(isValidNewPassword(password)).toBe(true);
  });
  it.each([
    'short123',
    '1234567890123',
    'OnlyLettersPassword',
    '𐐀123456789012',
    'a1'.repeat(65),
  ])('拒绝服务端不允许的密码格式 %s', (password) => {
    expect(isValidNewPassword(password)).toBe(false);
  });
});
