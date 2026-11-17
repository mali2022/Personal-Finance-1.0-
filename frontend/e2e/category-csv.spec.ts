import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

const newline = String.fromCharCode(13, 10);
const csvFile = (rows: string[]) =>
  [String.fromCharCode(0xfeff) + '分类名称,父级分类,状态', ...rows].join(newline) + newline;

const downloadText = async (
  page: import('@playwright/test').Page,
  click: () => Promise<void>,
) => {
  const pending = page.waitForEvent('download');
  await click();
  const download = await pending;
  const path = await download.path();
  return {
    name: download.suggestedFilename(),
    text: await readFile(path, 'utf8'),
  };
};

test('收入分类可导出当前分类并下载导入模板', async ({ page }) => {
  await page.goto('/categories');
  await page.getByRole('tab', { name: '收入分类', exact: true }).click();
  const exported = await downloadText(page, () =>
    page.getByRole('button', { name: '导出CSV', exact: true }).click(),
  );
  expect(exported.name).toBe('收入分类.csv');
  const lines = exported.text.split(newline);
  expect(lines[0]).toBe(String.fromCharCode(0xfeff) + '分类名称,父级分类,状态');
  expect(lines).toContain('职业收入,,启用');
  expect(lines).toContain('工资薪酬,职业收入,启用');
  const template = await downloadText(page, () =>
    page.getByRole('button', { name: '导入模板', exact: true }).click(),
  );
  expect(template.name).toBe('收入分类导入模板.csv');
  expect(template.text).toContain('工资收入');
});

test('导入先预览再确认，重复行与新增行分别标注', async ({ page }) => {
  await page.goto('/categories');
  await page.getByRole('tab', { name: '收入分类', exact: true }).click();
  await page.locator('.ant-upload input[type="file"]').setInputFiles({
    name: '收入分类.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      csvFile(['职业收入,,', '工资薪酬,职业收入,启用', '稿费,职业收入,停用']),
    ),
  });
  const dialog = page.getByRole('dialog', { name: '预览分类导入' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('可导入', { exact: true })).toHaveCount(1);
  await expect(dialog.getByText('同名分类已存在', { exact: true })).toHaveCount(2);
  await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(
    page.getByText('已导入 1 条分类，跳过 2 条', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('稿费', { exact: true }).first()).toBeVisible();
});

test('全部删除先预览保留项，输入确认文字后才提交', async ({ page }) => {
  await page.goto('/categories');
  await page.getByRole('tab', { name: '收入分类', exact: true }).click();
  await page.getByRole('button', { name: '全部删除', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '全部删除收入分类' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText('将尝试删除全部收入分类，共 2 个；其中 0 个可删除、2 个将保留。'),
  ).toBeVisible();
  await expect(dialog.getByText('保留：', { exact: false }).first()).toBeVisible();
  const confirm = dialog.getByRole('button', { name: '确认删除', exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('全部删除分类确认').fill('删除全部收入分类');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText('已删除 0 条、保留 2 条', { exact: true })).toBeVisible();
});
