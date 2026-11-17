namespace PersonalFinance.Api.Domain;

public static class AccountKinds
{
    public static readonly string[] All = ["Cash", "Bank", "CreditCard", "Alipay", "WeChat", "StoredValue", "Investment", "Receivable", "Payable", "Other", "ElectronicWallet", "ConsumerCredit", "ConsumerLoan", "SecuredLoan"];
    public static bool IsCredit(string type) => type is "CreditCard" or "ConsumerCredit";
    public static bool IsLiquid(string type) => type is "Cash" or "Bank" or "Alipay" or "WeChat" or "ElectronicWallet";
    public static bool IsLoan(string type) => type is "ConsumerLoan" or "SecuredLoan";
    public static bool IsContract(string type) => type is "Receivable" or "Payable" or "ConsumerLoan" or "SecuredLoan";
    public static bool IsBankCard(string type) => type is "Bank" or "CreditCard";
}
