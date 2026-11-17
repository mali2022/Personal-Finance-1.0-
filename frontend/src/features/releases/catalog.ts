import data from '../../data/releases.json';
export interface Release {
  id: string;
  version: string | null;
  productVersion?: string;
  date: string;
  kind: 'new' | 'improved' | 'fixed';
  title: { zh: string; en: string };
  changes: { zh: string; en: string }[];
}
export interface ReleaseCatalog {
  product?: {
    name: string;
    channel: string;
    version: string;
    releaseNumber: string;
  };
  currentVersion: string;
  releases: Release[];
}
export const bundledReleases = data as ReleaseCatalog;
export function isNewerVersion(candidate: string, current: string) {
  const a = candidate.split('.').map(Number),
    b = current.split('.').map(Number);
  for (let i = 0; i < 4; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
export function parseCatalog(value: unknown): ReleaseCatalog {
  const c = value as ReleaseCatalog;
  const text = (x: unknown) =>
    typeof x === 'string' && x.length > 0 && x.length <= 5000;
  const localized = (x: unknown) =>
    !!x &&
    typeof x === 'object' &&
    text((x as { zh: unknown }).zh) &&
    text((x as { en: unknown }).en);
  if (
    c?.product &&
    (c.product.releaseNumber !== c.currentVersion ||
      !/^\d+\.\d+\.\d+$/.test(c.product.version) ||
      c.product.name !== 'Personal Finance' ||
      c.product.channel !== 'stable')
  )
    throw new Error('Invalid product metadata');
  if (
    !c ||
    !/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(c.currentVersion) ||
    !Array.isArray(c.releases) ||
    c.releases.length < 1 ||
    c.releases.length > 1000 ||
    c.releases[0].version !== c.currentVersion ||
    c.releases.some(
      (r) =>
        !r ||
        !text(r.id) ||
        (r.productVersion !== undefined &&
          !/^\d+\.\d+\.\d+$/.test(r.productVersion)) ||
        (r.version !== null &&
          (typeof r.version !== 'string' ||
            !/^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(r.version))) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(r.date) ||
        !['new', 'improved', 'fixed'].includes(r.kind) ||
        !localized(r.title) ||
        !Array.isArray(r.changes) ||
        r.changes.length < 1 ||
        r.changes.length > 30 ||
        r.changes.some((x) => !localized(x)),
    )
  )
    throw new Error('Invalid release information');
  if (
    c.product &&
    c.releases[0].productVersion !== undefined &&
    c.product.version !== c.releases[0].productVersion
  )
    throw new Error('Inconsistent product version');
  const ids = new Set<string>();
  const versions = new Set<string>();
  let previousDate = '9999-12-31';
  for (const release of c.releases) {
    const date = new Date(release.date);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== release.date ||
      release.date > previousDate ||
      ids.has(release.id) ||
      (release.version !== null && versions.has(release.version))
    )
      throw new Error('Invalid release history');
    previousDate = release.date;
    ids.add(release.id);
    if (release.version !== null) versions.add(release.version);
  }
  return c;
}
export async function fetchReleases(): Promise<ReleaseCatalog> {
  const response = await fetch('/release-info.json', {
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Release information is unavailable');
  return parseCatalog(await response.json());
}
export async function activateUpdate(
  reload: () => void = () => window.location.reload(),
): Promise<void> {
  const registration =
    'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration()
      : undefined;
  if (registration) {
    await registration.update();
    const installing = registration.installing;
    if (installing && installing.state !== 'installed')
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => {
          clearTimeout(timer);
          installing.removeEventListener('statechange', changed);
          if (error) reject(error);
          else resolve();
        };
        const changed = () => {
          if (installing.state === 'installed') finish();
          else if (installing.state === 'redundant')
            finish(new Error('Update installation failed'));
        };
        const timer = setTimeout(
          () => finish(new Error('Update installation timed out')),
          120000,
        );
        installing.addEventListener('statechange', changed);
        changed();
      });
    if (registration.waiting) {
      const worker = registration.waiting;
      await new Promise<void>((resolve, reject) => {
        const changed = () => {
          clearTimeout(timer);
          navigator.serviceWorker.removeEventListener(
            'controllerchange',
            changed,
          );
          resolve();
        };
        const timer = setTimeout(() => {
          navigator.serviceWorker.removeEventListener(
            'controllerchange',
            changed,
          );
          reject(new Error('Update activation timed out'));
        }, 15000);
        navigator.serviceWorker.addEventListener('controllerchange', changed);
        worker.postMessage({ type: 'SKIP_WAITING' });
      });
    }
  }
  reload();
}
