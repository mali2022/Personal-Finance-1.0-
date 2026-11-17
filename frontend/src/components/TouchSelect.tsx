import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ComponentRef, CSSProperties } from 'react';
import { Input, Select as AntSelect } from 'antd';
import type { SelectProps } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useMobile } from '../hooks/useMobile';
import { t, useLocale } from '../i18n';
import '../design/mobile-controls.css';

const AdaptiveSelect = forwardRef<ComponentRef<typeof AntSelect>, SelectProps>(
  (props, ref) => {
    useLocale();
    const mobile = useMobile();
    const anchor = useRef<HTMLDivElement>(null);
    const [opened, setOpened] = useState(props.defaultOpen || false);
    const [search, setSearch] = useState('');
    const [layout, setLayout] = useState({ above: false, height: 280 });
    const open = props.open ?? opened;
    const searchable = !!props.showSearch || !!props.onSearch;
    const customTags = props.mode === 'tags';
    useEffect(() => {
      if (!mobile || !open) return;
      const align = () => {
        const bounds = anchor.current?.getBoundingClientRect();
        if (!bounds) return;
        const viewport = window.visualViewport;
        const top = viewport?.offsetTop || 0;
        const bottom = top + (viewport?.height || window.innerHeight);
        const below = bottom - bounds.bottom - 12;
        const above = bounds.top - top - 12;
        const flip = below < 180 && above > below;
        setLayout({
          above: flip,
          height: Math.max(96, Math.min(320, flip ? above : below)),
        });
      };
      align();
      window.addEventListener('resize', align);
      window.addEventListener('scroll', align, true);
      window.visualViewport?.addEventListener('resize', align);
      window.visualViewport?.addEventListener('scroll', align);
      return () => {
        window.removeEventListener('resize', align);
        window.removeEventListener('scroll', align, true);
        window.visualViewport?.removeEventListener('resize', align);
        window.visualViewport?.removeEventListener('scroll', align);
      };
    }, [mobile, open]);
    if (!mobile) return <AntSelect {...props} ref={ref} />;
    const wrapOptions =
      props.virtual === false ||
      (props.virtual !== true && (props.options?.length || 0) <= 200);
    return (
      <div
        ref={anchor}
        className={`touch-select-anchor ${props.className || ''} ${wrapOptions ? 'touch-select-wrap-options' : ''}`}
        data-popup-above={layout.above}
        style={
          {
            ...props.style,
            '--touch-options-height': `${layout.height}px`,
          } as CSSProperties
        }
      >
        <AntSelect
          {...props}
          ref={ref}
          open={open}
          style={{ width: '100%' }}
          showSearch={customTags ? props.showSearch : false}
          onSearch={customTags ? props.onSearch : undefined}
          searchValue={props.searchValue ?? search}
          virtual={wrapOptions ? false : props.virtual}
          listItemHeight={44}
          listHeight={Math.max(
            44,
            layout.height - (searchable && !customTags ? 66 : 16),
          )}
          getPopupContainer={() => anchor.current || document.body}
          onOpenChange={(next) => {
            setOpened(next);
            if (!next && !customTags) {
              setSearch('');
              props.onSearch?.('');
            }
            props.onOpenChange?.(next);
          }}
          onChange={(value, option) => {
            props.onChange?.(value, option);
            if (!customTags) {
              setSearch('');
              props.onSearch?.('');
            }
          }}
          popupRender={(menu) => (
            <>
              {searchable && !customTags && (
                <div className="touch-select-search">
                  <Input
                    aria-label={t('搜索选项')}
                    prefix={<SearchOutlined />}
                    allowClear
                    value={props.searchValue ?? search}
                    placeholder={t('输入关键词搜索')}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === 'Enter') event.preventDefault();
                      if (event.key === 'Escape') {
                        setOpened(false);
                        props.onOpenChange?.(false);
                      }
                    }}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      props.onSearch?.(event.target.value);
                    }}
                  />
                </div>
              )}
              {props.popupRender ? props.popupRender(menu) : menu}
            </>
          )}
        />
      </div>
    );
  },
);

// Preserve Ant's generic value/option typing at every existing call site.
export const Select = Object.assign(AdaptiveSelect, {
  Option: AntSelect.Option,
  OptGroup: AntSelect.OptGroup,
  SECRET_COMBOBOX_MODE_DO_NOT_USE: AntSelect.SECRET_COMBOBOX_MODE_DO_NOT_USE,
  _InternalPanelDoNotUseOrYouWillBeFired:
    AntSelect._InternalPanelDoNotUseOrYouWillBeFired,
}) as typeof AntSelect;
