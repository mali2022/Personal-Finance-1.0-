namespace PersonalFinance.Api.Contracts;
public sealed record RecurringInput(string Name, string Currency, SaveTransaction Transaction, DateTime StartLocal,
    string Frequency = "Month", int Interval = 1, string TimeZone = "Asia/Shanghai", string MonthEndPolicy = "Clamp",
    DateTime? EndLocal = null, int ReminderDays = 3, string State = "Active", string DetailedNote = "");
public sealed record RecurringAction(string Action, string Reason = "", string? TransactionVersion = null);
