using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PayrollLegacyAttributes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE [finance].[PayrollComponent] SET [Code]=N'Legacy' WHERE [Code]=N'';
                UPDATE [finance].[PayrollComponent] SET [Category]=N'Other' WHERE [Category]=N'';
                UPDATE [finance].[PayrollComponent] SET [TaxTreatment]=N'Unspecified' WHERE [TaxTreatment]=N'';
                UPDATE [finance].[PayrollComponent] SET [Status]=N'Active' WHERE [Status]=N'';
                UPDATE [finance].[PayrollComponent] SET [Quantity]=1 WHERE [Code]=N'Legacy' AND [Quantity]=0 AND [UnitRate]=0;
                UPDATE [finance].[SocialContributionRecord] SET [PaymentStatus]=CASE WHEN [Supplementary]=1 THEN N'Supplementary' ELSE N'Normal' END WHERE [PaymentStatus]=N'';
                ;WITH latest AS (
                    SELECT *, ROW_NUMBER() OVER(PARTITION BY [UserId],[AccountId] ORDER BY [PaidDate] DESC,[UpdatedAt] DESC,[Id]) AS rn
                    FROM [finance].[SocialContributionRecord]
                    WHERE [Kind]=N'HousingFund' AND [State]=N'Confirmed' AND [ReportedBalance] IS NOT NULL
                        AND [AccountId] IS NOT NULL AND [BalanceSource] IN (N'ManualStatement',N'ProviderStatement')
                )
                INSERT INTO [finance].[HousingFundAccount] ([Id],[UserId],[Version],[CreatedAt],[UpdatedAt],[Name],[EmploymentId],[City],[Currency],[AccountId],[LoanBusinessId],[ReportedBalance],[BalanceDate],[BalanceSource],[Evidence],[Status])
                SELECT CONVERT(nvarchar(36),NEWID()),x.[UserId],1,SYSDATETIMEOFFSET(),SYSDATETIMEOFFSET(),N'历史公积金 / Legacy housing fund',NULL,x.[Region],x.[Currency],x.[AccountId],x.[LoanBusinessId],x.[ReportedBalance],x.[PaidDate],x.[BalanceSource],N'从历史同资产账户最新已确认余额记录承接；不新增资产或资金交易。',N'Active'
                FROM latest x WHERE x.rn=1 AND NOT EXISTS(SELECT 1 FROM [finance].[HousingFundAccount] f WHERE f.[AccountId]=x.[AccountId]);
                UPDATE c SET [FundAccountId]=f.[Id]
                FROM [finance].[SocialContributionRecord] c JOIN [finance].[HousingFundAccount] f ON c.[AccountId]=f.[AccountId] AND c.[UserId]=f.[UserId]
                WHERE c.[Kind]=N'HousingFund' AND c.[FundAccountId] IS NULL;
                """);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
