using System.Text.Json.Serialization;
namespace PersonalFinance.Api.Contracts;
public sealed record BatchItem(string Id, string Version);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record BatchChanges(string? CategoryId = null, bool SetMerchant = false, string? Merchant = null, string[]? AddTagIds = null, string[]? RemoveTagIds = null, bool SetProject = false, string? ProjectId = null, bool SetNote = false, string? Note = null, string? AccountId = null, string? Status = null);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record TransactionBatch(BatchItem[] Items, BatchChanges Changes);
public sealed record ReviewAction(string State, string Note, DateTimeOffset? DeferredUntil = null);

