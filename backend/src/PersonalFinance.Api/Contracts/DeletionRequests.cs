namespace PersonalFinance.Api.Contracts;
public sealed record DeleteItem(string Id, string Version);
public sealed record DirectoryDeletion(DeleteItem[] Items, bool All = false);
public sealed record TransactionDeletion(DeleteItem[] Items);
