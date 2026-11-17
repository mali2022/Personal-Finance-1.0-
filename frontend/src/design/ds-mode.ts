export type DsMode = 'v1' | 'v2';

const STORAGE_KEY = 'pf-ds';
/** 默认 v2（2026.11.17 起）；VITE_DS_MODE=v1 或地址加 ?ds=v1 可回到旧版预览。 */
const BUILD_MODE: DsMode = import.meta.env.VITE_DS_MODE === 'v1' ? 'v1' : 'v2';

function normalize(value: string | null | undefined): DsMode | undefined {
  return value === 'v2' || value === 'v1' ? value : undefined;
}

/**
 * 解析当前设计系统版本。优先级：URL ?ds= > localStorage.pf-ds > 构建期常量。
 * ?ds= 会写回 localStorage，方便预览与验收时刷新保持。
 */
export function readDsMode(): DsMode {
  if (typeof window === 'undefined') return BUILD_MODE;
  const fromQuery = normalize(
    new URLSearchParams(window.location.search).get('ds'),
  );
  if (fromQuery) {
    try {
      window.localStorage.setItem(STORAGE_KEY, fromQuery);
    } catch {
      return fromQuery;
    }
    return fromQuery;
  }
  try {
    const stored = normalize(window.localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    return BUILD_MODE;
  }
  return BUILD_MODE;
}

/** 把版本写到 <html data-ds>，CSS 侧 [data-ds='v2'] 是唯一视觉入口。 */
export function applyDsMode(mode: DsMode = readDsMode()): DsMode {
  document.documentElement.dataset.ds = mode;
  return mode;
}

/** 切换版本后重载页面：v2 规则是按 CSS 作用域一次性生效的。 */
export function setDsMode(mode: DsMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    applyDsMode(mode);
    return;
  }
  window.location.reload();
}
