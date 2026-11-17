using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ExpandedCurrencyCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ManagedAsset",
                schema: "finance",
                table: "ManagedAsset");

            migrationBuilder.DropCheckConstraint(
                name: "CK_InvestmentAsset",
                schema: "finance",
                table: "InvestmentAsset");

            migrationBuilder.DropCheckConstraint(
                name: "CK_FxValuation",
                schema: "finance",
                table: "FxValuationRate");

            migrationBuilder.DropCheckConstraint(
                name: "CK_DebtPlan_Values",
                schema: "finance",
                table: "DebtRepaymentPlan");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CurrencyPreference",
                schema: "finance",
                table: "CurrencyPreference");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ManagedAsset",
                schema: "finance",
                table: "ManagedAsset",
                sql: "[Cost]>=0 AND [AnnualRate] BETWEEN 0 AND 100 AND [Currency] IN ('CNY','USD','HKD','EUR','GBP','JPY','AUD','CAD','CHF','SGD','NZD','KRW','TWD','MOP','THB','MYR','IDR','PHP','VND','INR','AED','SAR','TRY','ZAR','BRL','MXN','SEK','NOK','DKK','PLN','CZK','HUF') AND [Version]>0 AND [State] IN ('Active','Archived','Matured','EarlyWithdrawn')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_InvestmentAsset",
                schema: "finance",
                table: "InvestmentAsset",
                sql: "[Currency] IN ('CNY','USD','HKD','EUR','GBP','JPY','AUD','CAD','CHF','SGD','NZD','KRW','TWD','MOP','THB','MYR','IDR','PHP','VND','INR','AED','SAR','TRY','ZAR','BRL','MXN','SEK','NOK','DKK','PLN','CZK','HUF') AND [State] IN ('Active','Archived') AND [Version]>0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_FxValuation",
                schema: "finance",
                table: "FxValuationRate",
                sql: "[Rate]>0 AND [BaseCurrency]<>[TargetCurrency] AND [BaseCurrency] IN ('CNY','USD','HKD','EUR','GBP','JPY','AUD','CAD','CHF','SGD','NZD','KRW','TWD','MOP','THB','MYR','IDR','PHP','VND','INR','AED','SAR','TRY','ZAR','BRL','MXN','SEK','NOK','DKK','PLN','CZK','HUF') AND [TargetCurrency] IN ('CNY','USD','HKD','EUR','GBP','JPY','AUD','CAD','CHF','SGD','NZD','KRW','TWD','MOP','THB','MYR','IDR','PHP','VND','INR','AED','SAR','TRY','ZAR','BRL','MXN','SEK','NOK','DKK','PLN','CZK','HUF') AND [Version]>0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_DebtPlan_Values",
                schema: "finance",
                table: "DebtRepaymentPlan",
                sql: "[Principal]>0 AND [Periods] BETWEEN 1 AND 600 AND [Version]>0 AND [Currency] IN ('CNY','USD','HKD','EUR','GBP','JPY','AUD','CAD','CHF','SGD','NZD','KRW','TWD','MOP','THB','MYR','IDR','PHP','VND','INR','AED','SAR','TRY','ZAR','BRL','MXN','SEK','NOK','DKK','PLN','CZK','HUF') AND [PeriodRate] BETWEEN 0 AND 100 AND [FixedFee]>=0 AND [State] IN ('Active','Archived') AND (([Kind]='CreditInstallment' AND [BusinessId] IS NULL) OR ([Kind]='LoanRepayment' AND [BusinessId] IS NOT NULL AND [OriginalTransactionId] IS NULL)) AND ([MinimumPayment] IS NULL OR [MinimumPayment]>=0 AND [StatementAmount] IS NOT NULL AND [MinimumPayment]<=[StatementAmount])");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CurrencyPreference",
                schema: "finance",
                table: "CurrencyPreference",
                sql: "[Currency] IN ('CNY','USD','HKD','EUR','GBP','JPY','AUD','CAD','CHF','SGD','NZD','KRW','TWD','MOP','THB','MYR','IDR','PHP','VND','INR','AED','SAR','TRY','ZAR','BRL','MXN','SEK','NOK','DKK','PLN','CZK','HUF') AND [Version]>0 AND [SortOrder] BETWEEN 0 AND 1000");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_ManagedAsset",
                schema: "finance",
                table: "ManagedAsset");

            migrationBuilder.DropCheckConstraint(
                name: "CK_InvestmentAsset",
                schema: "finance",
                table: "InvestmentAsset");

            migrationBuilder.DropCheckConstraint(
                name: "CK_FxValuation",
                schema: "finance",
                table: "FxValuationRate");

            migrationBuilder.DropCheckConstraint(
                name: "CK_DebtPlan_Values",
                schema: "finance",
                table: "DebtRepaymentPlan");

            migrationBuilder.DropCheckConstraint(
                name: "CK_CurrencyPreference",
                schema: "finance",
                table: "CurrencyPreference");

            migrationBuilder.AddCheckConstraint(
                name: "CK_ManagedAsset",
                schema: "finance",
                table: "ManagedAsset",
                sql: "[Cost]>=0 AND [AnnualRate] BETWEEN 0 AND 100 AND [Currency] IN ('CNY','USD','HKD') AND [Version]>0 AND [State] IN ('Active','Archived','Matured','EarlyWithdrawn')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_InvestmentAsset",
                schema: "finance",
                table: "InvestmentAsset",
                sql: "[Currency] IN ('CNY','USD','HKD') AND [State] IN ('Active','Archived') AND [Version]>0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_FxValuation",
                schema: "finance",
                table: "FxValuationRate",
                sql: "[Rate]>0 AND [BaseCurrency]<>[TargetCurrency] AND [BaseCurrency] IN ('CNY','USD','HKD') AND [TargetCurrency] IN ('CNY','USD','HKD') AND [Version]>0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_DebtPlan_Values",
                schema: "finance",
                table: "DebtRepaymentPlan",
                sql: "[Principal]>0 AND [Periods] BETWEEN 1 AND 600 AND [Version]>0 AND [Currency] IN ('CNY','USD','HKD') AND [PeriodRate] BETWEEN 0 AND 100 AND [FixedFee]>=0 AND [State] IN ('Active','Archived') AND (([Kind]='CreditInstallment' AND [BusinessId] IS NULL) OR ([Kind]='LoanRepayment' AND [BusinessId] IS NOT NULL AND [OriginalTransactionId] IS NULL)) AND ([MinimumPayment] IS NULL OR [MinimumPayment]>=0 AND [StatementAmount] IS NOT NULL AND [MinimumPayment]<=[StatementAmount])");

            migrationBuilder.AddCheckConstraint(
                name: "CK_CurrencyPreference",
                schema: "finance",
                table: "CurrencyPreference",
                sql: "[Currency] IN ('CNY','USD','HKD') AND [Version]>0 AND [SortOrder] BETWEEN 0 AND 1000");
        }
    }
}
