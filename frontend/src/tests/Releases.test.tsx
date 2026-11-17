import { render, screen, fireEvent, within } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReleaseNotesPage from '../pages/ReleaseNotesPage';
import {
  activateUpdate,
  bundledReleases,
  parseCatalog,
  isNewerVersion,
} from '../features/releases/catalog';
import { useUI } from '../stores/ui';
afterEach(() => {
  vi.unstubAllGlobals();
  useUI.setState({ language: 'zh-CN' });
});
function show() {
  return render(
    <App>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <ReleaseNotesPage />
        </MemoryRouter>
      </QueryClientProvider>
    </App>,
  );
}
const newerRelease =
  bundledReleases.currentVersion.split('.').slice(0, 3).join('.') +
  '.' +
  String(Number(bundledReleases.currentVersion.split('.')[3]) + 1);
describe('release center', () => {
  it('rejects inconsistent product identities, duplicate entries and invalid calendar dates', () => {
    expect(() =>
      parseCatalog({
        ...bundledReleases,
        product: { ...bundledReleases.product!, version: '0.0.0' },
      }),
    ).toThrow();
    expect(() =>
      parseCatalog({
        ...bundledReleases,
        releases: [bundledReleases.releases[0], bundledReleases.releases[0]],
      }),
    ).toThrow();
    expect(() =>
      parseCatalog({
        ...bundledReleases,
        releases: [{ ...bundledReleases.releases[0], date: '2026-02-31' }],
      }),
    ).toThrow();
  });
  it('keeps a unique product history anchored to the official 1.0.0 release', () => {
    const versions = bundledReleases.releases.map((r) => r.productVersion);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions.at(-1)).toBe('1.0.0');
    expect(versions[0]).toBe(bundledReleases.product?.version);
    expect(bundledReleases.product?.channel).toBe('stable');
    expect(() =>
      parseCatalog({
        ...bundledReleases,
        releases: [
          { ...bundledReleases.releases[0], productVersion: 'invalid' },
        ],
      }),
    ).toThrow();
  });
  it('finds the official 1.0.0 release by product version and displays its changes', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => bundledReleases }),
    );
    const official = bundledReleases.releases.find(
      (entry) => entry.productVersion === '1.0.0',
    );
    expect(official).toBeDefined();
    show();
    fireEvent.change(screen.getByLabelText('搜索更新内容'), {
      target: { value: '1.0.0' },
    });
    const title = await screen.findByText(official!.title.zh);
    const entry = title.closest('.release-entry') as HTMLElement | null;
    expect(entry).not.toBeNull();
    expect(within(entry as HTMLElement).getByText('Personal Finance 1.0.0')).toBeVisible();
  });
  it('compares numeric version components and never offers a downgrade', () => {
    expect(isNewerVersion('2026.10.17.10', '2026.10.17.2')).toBe(true);
    expect(isNewerVersion('2026.10.17.1', '2026.10.17.2')).toBe(false);
    expect(isNewerVersion('2026.10.17.1', '2026.10.17.1')).toBe(false);
  });
  it('searches the restored historical feature details', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => bundledReleases }),
    );
    show();
    expect(
      screen.getByText(`v${bundledReleases.product?.version}`),
    ).toBeVisible();
    for (const keyword of [
      '周期交易',
      '年度预算',
      '三级分类',
      '全局 Copilot',
    ]) {
      fireEvent.change(screen.getByLabelText('搜索更新内容'), {
        target: { value: keyword },
      });
      expect(
        (await screen.findAllByText(new RegExp(keyword))).length,
      ).toBeGreaterThan(0);
    }
  });
  it('shows releases and searches real change text', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => bundledReleases }),
    );
    show();
    expect(
      await screen.findByText(bundledReleases.releases[0].title.zh),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText('搜索更新内容'), {
      target: { value: 'Agent' },
    });
    expect(
      (await screen.findAllByText(/自主财务 Agent/)).length,
    ).toBeGreaterThan(0);
    const latest = bundledReleases.releases[0];
    const latestMentionsAgent = [latest.title.zh, ...latest.changes.map(change => change.zh)].some(text => text.toLowerCase().includes('agent'));
    expect(!!screen.queryByText(bundledReleases.releases[0].title.zh)).toBe(latestMentionsAgent);
  });
  it('keeps bundled release notes available offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    show();
    expect(
      await screen.findByText('暂时无法检查更新，已显示本机更新记录'),
    ).toBeVisible();
    expect(
      screen.getByText(bundledReleases.releases[0].title.zh),
    ).toBeVisible();
  });
  it('shows English and announces a newer version without reloading automatically', async () => {
    useUI.setState({ language: 'en' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ...bundledReleases,
          currentVersion: newerRelease,
          product: {
            ...bundledReleases.product!,
            releaseNumber: newerRelease,
          },
          releases: [
            { ...bundledReleases.releases[0], version: newerRelease },
            ...bundledReleases.releases.slice(1),
          ],
        }),
      }),
    );
    show();
    expect(
      await screen.findByText(`New version available: v${newerRelease}`),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Update and reload' }),
    ).toBeEnabled();
    expect(
      screen.getByText(bundledReleases.releases[0].title.en),
    ).toBeVisible();
  });
  it('rejects incomplete public release data', () => {
    expect(() =>
      parseCatalog({ currentVersion: '2026.10.17.2', releases: [] }),
    ).toThrow();
    expect(() =>
      parseCatalog({
        ...bundledReleases,
        releases: [{ ...bundledReleases.releases[0], changes: [null] }],
      }),
    ).toThrow();
  });
  it('activates the waiting worker before reloading and does not clear user data', async () => {
    const events = new EventTarget();
    const reload = vi.fn();
    const postMessage = vi.fn(() =>
      events.dispatchEvent(new Event('controllerchange')),
    );
    const update = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      serviceWorker: Object.assign(events, {
        getRegistration: async () => ({ update, waiting: { postMessage } }),
      }),
    });
    await activateUpdate(reload);
    expect(update).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).toHaveBeenCalledOnce();
  });
});
