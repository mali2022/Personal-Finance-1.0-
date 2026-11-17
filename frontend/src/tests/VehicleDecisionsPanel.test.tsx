import { expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { App } from 'antd';
import VehicleDecisionsPanel from '../features/fuel/VehicleDecisionsPanel';
import { lifeApi } from '../api/lifeSimulator';
import { apiClient } from '../api/client';
it('requires a native baseline and reviewed preview before saving the same selected alternatives', async () => {
  vi.spyOn(lifeApi, 'snapshot').mockResolvedValue({
    id: 'snapshot',
    snapshot: {
      capturedAt: '2026-10-31',
      suggested: { monthlyExpense: 2000, restrictedAssets: 0 },
    },
  } as never);
  vi.spyOn(apiClient, 'post').mockResolvedValue({
    data: {
      data: {
        snapshotId: 'snapshot',
        modelVersion: 'native',
        results: [
          {
            name: 'Keep current',
            finalNetWorth: 10000,
            minimumCash: 1000,
            firstShortfall: null,
            totalExpense: 100,
            warnings: [],
          },
        ],
      },
    },
  } as never);
  render(
    <App>
      <VehicleDecisionsPanel hidden={false} english />
    </App>,
  );
  const preview=screen.getByRole('button', { name: 'Preview deterministic comparison' });
  const save=screen.getByRole('button', { name: 'Save to native life simulator' });
  expect(preview).toBeDisabled();expect(save).toBeDisabled();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Create / refresh native financial baseline',
    }),
  );
  await waitFor(() =>
    expect(
      preview,
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'I verified the baseline, assumptions and terminal disposal policy',
    }),
  );
  fireEvent.click(
    preview,
  );
  await waitFor(() =>
    expect(
      save,
    ).toBeEnabled(),
  );
  expect(apiClient.post).toHaveBeenCalledWith(
    '/fuel/decisions/preview',
    expect.objectContaining({
      snapshotId: 'snapshot',
      confirmAssumptions: true,
      options: expect.arrayContaining([
        expect.objectContaining({ type: 'Keep' }),
        expect.objectContaining({ type: 'Reduce' }),
      ]),
    }),
    expect.any(Object),
  );
  fireEvent.click(
    save,
  );
  await waitFor(() =>
    expect(apiClient.post).toHaveBeenCalledWith(
      '/fuel/decisions/save',
      vi.mocked(apiClient.post).mock.calls[0][1],
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': expect.any(String),
        }),
      }),
    ),
  );
});
