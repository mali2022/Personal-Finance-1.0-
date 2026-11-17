using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Globalization;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record ReconciliationCandidate(string TransactionId, string Version, string Type, string Merchant, string Amount, int Score, string Confidence, [property:JsonConverter(typeof(ReconciliationDecimalConverter))] decimal Difference, int DateDeviation, string[] Reasons, int? PostedDateDeviation = null);
public sealed class ReconciliationDecimalConverter : JsonConverter<decimal>
{
    public override decimal Read(ref Utf8JsonReader reader,Type type,JsonSerializerOptions options)=>reader.TokenType==JsonTokenType.String?decimal.Parse(reader.GetString()!,NumberStyles.Number,CultureInfo.InvariantCulture):reader.GetDecimal();
    public override void Write(Utf8JsonWriter writer,decimal value,JsonSerializerOptions options)=>writer.WriteStringValue(value.ToString("0.00##########################",CultureInfo.InvariantCulture));
}
public sealed record ReconciliationIdentityContext(bool? CounterpartyMatches = null, bool? PaymentSourceMatches = null);

public static class SmartReconciliationEngine
{
    public const int CandidateLimit = 100;
    public const int DateWindow = 7;
    public static string Normalize(string? text) => new((text ?? "").Normalize(NormalizationForm.FormKC).ToUpperInvariant().Where(char.IsLetterOrDigit).ToArray());
    public static ReconciliationCandidate Score(StatementRecord row, FinanceTransaction t, decimal ledger, int highThreshold = 80, int mediumThreshold = 55, ReconciliationIdentityContext? identity = null)
    {
        highThreshold = Math.Clamp(highThreshold, 80, 100);
        mediumThreshold = Math.Clamp(mediumThreshold, 55, highThreshold - 1);
        var reasons = new List<string>();
        var days = Math.Abs((row.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date - t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date).Days);
        int? postedDays = row.PostedAt.HasValue ? Math.Abs((row.PostedAt.Value.ToOffset(TimeSpan.FromHours(8)).Date - t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date).Days) : null;
        var matchingDays = Math.Min(days, postedDays ?? days);
        var difference = row.Amount - ledger;
        var sameDirection = Math.Sign(row.Amount) == Math.Sign(ledger);
        var score = 0;
        if (difference == 0) { score += 40; reasons.Add("AmountExact"); } else reasons.Add("AmountDifference");
        if (matchingDays <= DateWindow) { score += Math.Max(0, 15 - matchingDays * 2); reasons.Add("DateWithinWindow"); } else reasons.Add("DateDifference");
        if(postedDays.HasValue)reasons.Add(postedDays<=DateWindow?"PostingDateWithinWindow":"PostingDateDifference");
        var merchant = Normalize(row.Merchant); var target = Normalize(t.Merchant);
        if (merchant.Length > 0 && merchant == target) { score += 20; reasons.Add("MerchantExact"); }
        else if (merchant.Length >= 3 && target.Length >= 3 && (merchant.Contains(target) || target.Contains(merchant))) { score += 10; reasons.Add("MerchantSimilar"); }
        else reasons.Add("MerchantUnverified");
        if (row.Reference.Length > 0 && row.Reference == t.ExternalId) { score += 20; reasons.Add("ReferenceExact"); }
        if (row.Type == t.Type) { score += 5; reasons.Add("TypeExact"); }
        if (Normalize(row.Note).Length >= 4 && Normalize(row.Note) == Normalize(t.Note)) { score = Math.Min(100, score + 5); reasons.Add("NoteExact"); }
        if (t.Type is "Transfer" or "CreditCardPayment") reasons.Add("CheckOtherAccountEnd");
        if (t.Type == "Refund") reasons.Add(t.OriginalTransactionId == null ? "RefundOriginMissing" : "RefundOriginLinked");
        if(t.Fee>0)reasons.Add("FeeIncludedInAccountFlow");
        if(t.Type is "Expense" or "Refund" && t.Entries.Where(e=>e.Kind=="Account").Select(e=>e.AccountId).Distinct().Count()>1)reasons.Add("MultiplePaymentSources");
        if(row.CounterpartyKey.Length>0){if(identity?.CounterpartyMatches==true){score+=10;reasons.Add("CounterpartyExact");}else reasons.Add(identity?.CounterpartyMatches==false?"CounterpartyMismatch":"CounterpartyUnverified");}
        if(row.PaymentSource.Length>0){if(identity?.PaymentSourceMatches==true){score+=5;reasons.Add("PaymentSourceExact");}else reasons.Add("PaymentSourceUnverified");}
        score=Math.Min(100,score);
        var isolated = row.Currency == t.Entries.FirstOrDefault(e => e.Kind == "Account" && e.AccountId == row.AccountId)?.Currency && t.UserId == row.UserId;
        if (!isolated || !sameDirection || t.Status == "Deleted" || identity?.CounterpartyMatches==false) { score = 0; reasons.Add("BusinessConflict"); }
        return new(t.Id, t.Version.ToString(), t.Type, t.Merchant ?? "", FinanceService.M(ledger), score, score == 0 ? "Conflict" : difference != 0 ? "Low" : score >= highThreshold ? "High" : score >= mediumThreshold ? "Medium" : "Low", difference, days, reasons.ToArray(),postedDays);
    }
}
