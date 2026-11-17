import type { Category } from '../types';
export function categoryPath(categories: Category[], id: string): Category[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const result: Category[] = [],
    seen = new Set<string>();
  let category = byId.get(id);
  while (category && !seen.has(category.id)) {
    seen.add(category.id);
    result.unshift(category);
    category = category.parentId ? byId.get(category.parentId) : undefined;
  }
  return result;
}
export const categoryLabel = (categories: Category[], id: string) =>
  categoryPath(categories, id)
    .map((c) => c.name)
    .join(' / ');
export const categoryActive = (categories: Category[], id: string) => {
  const path = categoryPath(categories, id);
  return (
    path.length > 0 &&
    !path[0].parentId &&
    path.every((c) => c.status === 'Active')
  );
};
export const categoriesOverlap = (categories: Category[], ids: string[]) =>
  ids.some((id) =>
    categoryPath(categories, id)
      .slice(0, -1)
      .some((c) => ids.includes(c.id)),
  );
