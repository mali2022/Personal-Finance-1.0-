import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { categoryApi } from '../api/finance';
import { useMobile } from '../hooks/useMobile';
import { t as tr, useLocale } from '../i18n';
import {
  categoryActive,
  categoryLabel,
  categoryPath,
} from '../utils/categories';
import type { Category } from '../types';
import '../design/category-picker.css';

export interface CategoryPickerProps {
  history?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
  id?: string;
  value?: string;
  onChange?: (value: string) => void;
  kind?: 'Expense' | 'Income' | 'All';
}

interface CategoryNode {
  category: Category;
  children: CategoryNode[];
}

interface Anchor {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

const NO_CATEGORIES: Category[] = [];

export function CategoryPicker(props: CategoryPickerProps) {
  useLocale();
  const mobile = useMobile();
  const query = useQuery({ queryKey: ['categories'], queryFn: categoryApi.list });
  const categories = query.data ?? NO_CATEGORIES;
  const value = props.value;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [drill, setDrill] = useState<CategoryNode[]>([]);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const { roots, paths } = useMemo(() => {
    const kind = props.kind ?? 'Expense';
    const nodes = new Map<string, CategoryNode>();
    for (const category of categories) {
      if (kind !== 'All' && category.kind !== kind) continue;
      if (!props.history && !categoryActive(categories, category.id)) continue;
      nodes.set(category.id, { category, children: [] });
    }
    const top: CategoryNode[] = [];
    for (const node of nodes.values()) {
      const parentId = node.category.parentId;
      if (!parentId) top.push(node);
      else nodes.get(parentId)?.children.push(node);
    }
    const sortNodes = (list: CategoryNode[]) => {
      list.sort(
        (a, b) =>
          a.category.sortOrder - b.category.sortOrder ||
          a.category.name.localeCompare(b.category.name),
      );
      list.forEach((node) => sortNodes(node.children));
    };
    sortNodes(top);
    // The API only accepts a second or third level category, so a top level without children can never be chosen.
    const selectable = top.filter((node) => node.children.length > 0);
    const chains = new Map<string, CategoryNode[]>();
    const walk = (list: CategoryNode[], trail: CategoryNode[]) => {
      for (const node of list) {
        const chain = [...trail, node];
        chains.set(node.category.id, chain);
        walk(node.children, chain);
      }
    };
    walk(selectable, []);
    return { roots: selectable, paths: chains };
  }, [categories, props.kind, props.history]);

  const keyword = search.trim().toLowerCase();
  const results = useMemo(() => {
    if (!keyword) return [];
    const hits: CategoryNode[] = [];
    for (const chain of paths.values()) {
      const node = chain[chain.length - 1];
      if (categoryLabel(categories, node.category.id).toLowerCase().includes(keyword))
        hits.push(node);
    }
    return hits.slice(0, 60);
  }, [keyword, paths, categories]);

  const selectedPath = value ? categoryPath(categories, value) : [];
  const selectedText = value
    ? selectedPath.length
      ? `${selectedPath.map((category) => category.name).join(' / ')}${
          categoryActive(categories, value) ? '' : ` · ${tr('已停用')}`
        }`
      : value
    : '';
  const placeholder =
    props.kind === 'All' ? tr('选择收入或支出分类') : tr('选择分类');
  const ariaLabel =
    props.ariaLabel || (props.id ? undefined : tr('二级或三级分类'));

  const kindPrefix = (category: Category) =>
    props.kind === 'All'
      ? `${tr(category.kind === 'Income' ? '收入' : '支出')} · `
      : '';
  const inactiveSuffix = (category: Category) =>
    categoryActive(categories, category.id) ? '' : ` · ${tr('已停用')}`;

  const close = () => {
    setOpen(false);
    setSearch('');
  };

  const choose = (node: CategoryNode) => {
    props.onChange?.(node.category.id);
    close();
  };

  const clear = () => {
    props.onChange?.('');
    close();
  };

  const toggle = () => {
    if (props.disabled) return;
    if (open) {
      close();
      return;
    }
    const chain = value ? paths.get(value) : undefined;
    setDrill(chain ? chain.slice(0, -1) : []);
    setSearch('');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      setSearch('');
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!open || mobile) {
      setAnchor(null);
      return;
    }
    const measure = () => {
      const element = triggerRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const width = Math.min(
        Math.max(rect.width, 300),
        Math.max(240, window.innerWidth - 16),
      );
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const flip = below < 280 && above > below;
      const maxHeight = Math.max(200, Math.min(380, flip ? above : below));
      setAnchor({
        width,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: flip ? Math.max(8, rect.top - maxHeight - 6) : rect.bottom + 6,
        maxHeight,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, mobile]);

  const renderItem = (node: CategoryNode, showPath = false) => {
    const leaf = node.children.length === 0;
    const selected = node.category.id === value;
    const path =
      `${kindPrefix(node.category)}${categoryLabel(categories, node.category.id)}${inactiveSuffix(node.category)}`;
    const text = showPath
      ? path
      : `${kindPrefix(node.category)}${node.category.name}${inactiveSuffix(node.category)}`;
    return (
      <button
        key={node.category.id}
        type="button"
        className={`category-picker-item ${leaf ? 'is-leaf' : 'is-branch'}${
          selected ? ' is-selected' : ''
        }`}
        data-category-id={node.category.id}
        data-selectable={leaf ? 'true' : 'false'}
        aria-current={selected ? 'true' : undefined}
        aria-label={leaf ? path : `${path} · ${tr('进入下级')}`}
        onClick={() => (leaf ? choose(node) : setDrill(paths.get(node.category.id) ?? [node]))}
      >
        <span className="category-picker-item-text">{text}</span>
        {!leaf && (
          <span className="category-picker-arrow" aria-hidden="true">
            ›
          </span>
        )}
      </button>
    );
  };

  const current = drill.length ? drill[drill.length - 1].children : roots;
  const groups =
    props.kind === 'All' && drill.length === 0
      ? (
          [
            { key: 'Expense', nodes: roots.filter((node) => node.category.kind === 'Expense') },
            { key: 'Income', nodes: roots.filter((node) => node.category.kind === 'Income') },
          ] as const
        ).filter((group) => group.nodes.length > 0)
      : [];

  const levelView = groups.length ? (
    <>
      {groups.map((group) => (
        <section key={group.key} className="category-picker-section">
          <h4 className="category-picker-section-title">
            {tr(group.key === 'Income' ? '收入' : '支出')}
          </h4>
          <div className="category-picker-grid">{group.nodes.map((node) => renderItem(node))}</div>
        </section>
      ))}
    </>
  ) : current.length ? (
    <div className={drill.length ? 'category-picker-list' : 'category-picker-grid'}>
      {current.map((node) => renderItem(node))}
    </div>
  ) : (
    <p className="category-picker-empty">{tr('没有匹配的分类')}</p>
  );

  return (
    <div className="category-picker">
      <button
        ref={triggerRef}
        id={props.id}
        type="button"
        className={`category-picker-trigger${selectedText ? '' : ' is-empty'}`}
        disabled={props.disabled}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="category-picker-trigger-text">
          {selectedText || placeholder}
        </span>
        <span className="category-picker-caret" aria-hidden="true" />
      </button>
      {props.history && value && !props.disabled && (
        <button
          type="button"
          className="category-picker-clear"
          aria-label={tr('清除分类')}
          onClick={clear}
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
      {open &&
        (mobile || anchor) &&
        createPortal(
          <div
            ref={panelRef}
            className="category-picker-panel"
            role="dialog"
            aria-modal={mobile || undefined}
            aria-label={tr('选择分类')}
            data-mobile={mobile ? 'true' : undefined}
            style={anchor ?? undefined}
          >
            <div className="category-picker-search">
              <input
                type="search"
                autoFocus
                value={search}
                placeholder={tr('输入分类关键词')}
                aria-label={tr('搜索分类')}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {keyword ? (
              <div className="category-picker-body">
                {results.length ? (
                  <div className="category-picker-list">
                    {results.map((node) => renderItem(node, true))}
                  </div>
                ) : (
                  <p className="category-picker-empty">{tr('没有匹配的分类')}</p>
                )}
              </div>
            ) : (
              <>
                {drill.length > 0 && (
                  <div className="category-picker-nav">
                    <button
                      type="button"
                      className="category-picker-back"
                      onClick={() => setDrill(drill.slice(0, -1))}
                    >
                      {tr('返回上一级')}
                    </button>
                    <nav className="category-picker-crumbs" aria-label={tr('分类层级')}>
                      <button
                        type="button"
                        className="category-picker-crumb"
                        onClick={() => setDrill([])}
                      >
                        {tr('全部')}
                      </button>
                      {drill.map((node, index) => (
                        <Fragment key={node.category.id}>
                          <span className="category-picker-crumb-sep" aria-hidden="true">
                            /
                          </span>
                          <button
                            type="button"
                            className="category-picker-crumb"
                            aria-current={index === drill.length - 1 ? 'page' : undefined}
                            onClick={() => setDrill(drill.slice(0, index + 1))}
                          >
                            {node.category.name}
                          </button>
                        </Fragment>
                      ))}
                    </nav>
                  </div>
                )}
                <div className="category-picker-body">{levelView}</div>
              </>
            )}
            <div className="category-picker-foot">
              <span className="category-picker-final">
                {selectedText
                  ? tr('最终分类路径：{0}', selectedText)
                  : tr('最终分类路径：未选择')}
              </span>
              {props.history && value && (
                <button
                  type="button"
                  className="category-picker-foot-clear"
                  onClick={clear}
                >
                  {tr('清除分类')}
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
