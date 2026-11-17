import catalog from '../../data/releases.json';
import { useLocale } from '../../i18n';
export const productVersion = catalog.product;
export function ProductVersion() {
  const en = useLocale() === 'en';
  return (
    <div
      className="product-version"
      style={{
        fontSize: 12,
        lineHeight: 1.8,
        color: 'var(--text-secondary)',
        padding: '8px 0',
        overflowWrap: 'anywhere',
      }}
    >
      <div>
        {[
          productVersion.name,
          productVersion.channel === 'beta' ? (en ? 'Beta' : '测试版') : null,
          productVersion.version,
        ]
          .filter(Boolean)
          .join(' ')}
      </div>
      <div>
        {en ? 'Release' : '发布号'}：{productVersion.releaseNumber}
      </div>
    </div>
  );
}
