namespace PersonalFinance.Api.Contracts;
public sealed record PhysicalCategoryInput(string Name, string? ParentId = null, int Sort = 0, bool Enabled = true, string Tags = "", string DefaultMethod = "Manual", int DefaultLifeMonths = 60);
public sealed record PhysicalCategoryAction(string Reason, string? TargetId = null);
public sealed record PhysicalProfileInput(string? CategoryId = null, string Code = "", string Brand = "", string Model = "", string SerialNumber = "", string Merchant = "", string? PaymentAccountId = null, string PhotoUrl = "", string ReceiptUrl = "", string Location = "", string Holder = "", string Tags = "", DateOnly? InServiceDate = null, DateOnly? WarrantyUntil = null, int MaintenanceDays = 180, int InventoryDays = 365, int StaleDays = 90, int IdleDays = 90, string InitialState = "Active", decimal Quantity = 1, string? Name = null, string? Note = null);
public sealed record PhysicalRuleInput(DateOnly Date, string Method, string Source, int LifeMonths = 60, decimal Residual = 0, decimal AnnualRate = 20, decimal? Amount = null, decimal? MarketValue = null, decimal? NetRealizableValue = null, decimal? ReplacementCost = null);
public sealed record PhysicalEventInput(DateOnly Date, string Kind, string Reason, decimal Quantity = 0, string? ReversesId = null);
public sealed record PhysicalCostInput(string TransactionId, string Kind, string Reason = "");
