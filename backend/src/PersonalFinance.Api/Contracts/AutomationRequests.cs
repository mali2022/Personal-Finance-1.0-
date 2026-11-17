namespace PersonalFinance.Api.Contracts;
public sealed record SubscriptionInput(string Name, string Provider, RecurringInput Rule, bool AutoRenew = true, string State = "Active", DateTimeOffset? ServiceEndsAt = null, DateTimeOffset? PriceEffectiveAt = null, string Note = "");
public sealed record AutomationConditions(string? MerchantExact = null, string? MerchantKeyword = null, string? NoteKeyword = null, string? MinimumAmount = null, string? MaximumAmount = null, string? AccountId = null, string? Type = null, string? Currency = null, string? Source = null, DateTimeOffset? Start = null, DateTimeOffset? End = null);
public sealed record AutomationActions(string? CategoryId = null, string? Merchant = null, string[]? TagIds = null, string? ProjectId = null, string? Note = null, string? TemplateId = null);
public sealed record AutomationInput(string Name, AutomationConditions Conditions, AutomationActions Actions, int Priority = 100, string State = "Active", bool PreviewOnly = true);
public sealed record AutomationBatch(string[] OccurrenceIds, string? PreviewToken = null);
public sealed record AutomationDraft(SaveTransaction Transaction);
