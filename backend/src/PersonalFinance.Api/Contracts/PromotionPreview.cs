namespace PersonalFinance.Api.Contracts;
public sealed record PromotionPreview(string AccountId, PromotionInput Promotion, bool Fee = false);
