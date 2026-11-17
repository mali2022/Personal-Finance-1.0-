import { Select } from './TouchSelect';
import { t as tr, useLocale } from '../i18n';

import { useUI } from '../stores/ui';
export function LanguageSelect() {
  useLocale();
  const language = useUI((s) => s.language);
  const setLanguage = useUI((s) => s.setLanguage);
  return (
    <Select
      className="language-select"
      aria-label={tr("Language / 语言")}
      value={language}
      onChange={setLanguage}
      options={[
        { value: 'zh-CN', label: tr("简体中文") },
        { value: 'en', label: 'English' },
      ]}
      style={{ minWidth: 110 }}
    />
  );
}
