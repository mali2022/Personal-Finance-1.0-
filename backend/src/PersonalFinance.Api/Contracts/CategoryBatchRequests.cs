namespace PersonalFinance.Api.Contracts;
public sealed record CategoryImportRow(int Row, string? Name, string? ParentPath, string? Status);
public sealed record CategoryImportInput(string Kind, CategoryImportRow[] Rows);
public sealed record CategoryKindInput(string Kind);
public sealed record CategoryBatchDelete(string Kind, DeleteItem[] Items);
