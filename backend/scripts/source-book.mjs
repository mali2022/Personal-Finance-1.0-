import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
async function collect(dir) {
  for (const item of await readdir(path.join(root, dir), {
    withFileTypes: true,
  })) {
    if (
      ["bin", "obj", ".keys", "Properties"].includes(item.name) ||
      /local\.json$/i.test(item.name)
    )
      continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) await collect(file);
    else if (/\.(cs|csproj|json|mjs|ps1|sql)$/.test(file)) files.push(file);
  }
}
for (const dir of ["src", "tests", "scripts"]) await collect(dir);
files.push(
  "README.md",
  "Dockerfile",
  ".dockerignore",
  ".gitignore",
  "NuGet.Config",
  "../.github/workflows/backend.yml",
);
let result =
  "# 完整后端源码\n\n由 scripts/source-book.mjs 生成，排除密码、签名密钥、Data Protection keys、依赖缓存和编译产物。当前应用数据库为 PersonalFinanceWeb。\n\n";
for (const file of files.sort()) {
  const ext = path.extname(file).slice(1),
    language =
      {
        cs: "csharp",
        csproj: "xml",
        mjs: "javascript",
        ps1: "powershell",
        md: "markdown",
        Config: "xml",
        yml: "yaml",
      }[ext] || ext;
  result += `## ${file.replaceAll("\\", "/")}\n\n\`\`\`\`${language}\n${(await readFile(path.join(root, file), "utf8")).trimEnd()}\n\`\`\`\`\n\n`;
}
await mkdir(path.join(root, "docs"), { recursive: true });
await writeFile(path.join(root, "docs/Personal Finance 测试版 2.0.0 - 019 - 完整后端代码.md"), result);
console.log(`已输出 ${files.length} 个后端源码/配置文件，无本地秘密。`);
