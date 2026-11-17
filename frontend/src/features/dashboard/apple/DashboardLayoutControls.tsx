import { useState } from 'react';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { t as tr } from '../../../i18n';
import {
  APPLE_MODULE_LABELS,
  type AppleDashboardLayout,
} from './useAppleDashboardLayout';

/**
 * Module visibility / ordering controls. A plain disclosure panel (not a
 * popover) keeps keyboard behaviour and mobile overflow predictable, and every
 * action is persisted immediately by the layout hook.
 */
export function DashboardLayoutControls({
  layout,
}: {
  layout: AppleDashboardLayout;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="dash-layout" data-testid="dashboard-layout-controls">
      <button
        type="button"
        className="pf-link dash-layout-trigger"
        aria-expanded={open}
        aria-controls="dash-layout-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <AppstoreOutlined aria-hidden="true" />
        {tr('模块布局')}
      </button>
      {open ? (
        <div
          className="dash-layout-panel"
          id="dash-layout-panel"
          role="group"
          aria-label={tr('模块显示与排序')}
        >
          <div className="dash-layout-head">
            <strong>{tr('模块显示与排序')}</strong>
            <button
              type="button"
              className="pf-link"
              onClick={() => layout.reset()}
            >
              {tr('恢复默认布局')}
            </button>
          </div>
          <ol className="dash-layout-list">
            {layout.order.map((module, index) => (
              <li key={module}>
                <label className="dash-layout-check">
                  <input
                    type="checkbox"
                    checked={layout.isVisible(module)}
                    onChange={() => layout.toggle(module)}
                  />
                  <span>{tr(APPLE_MODULE_LABELS[module])}</span>
                </label>
                <span className="dash-layout-actions">
                  <button
                    type="button"
                    aria-label={tr('上移 {0}', tr(APPLE_MODULE_LABELS[module]))}
                    disabled={index === 0}
                    onClick={() => layout.move(module, -1)}
                  >
                    <ArrowUpOutlined aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={tr('下移 {0}', tr(APPLE_MODULE_LABELS[module]))}
                    disabled={index === layout.order.length - 1}
                    onClick={() => layout.move(module, 1)}
                  >
                    <ArrowDownOutlined aria-hidden="true" />
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
