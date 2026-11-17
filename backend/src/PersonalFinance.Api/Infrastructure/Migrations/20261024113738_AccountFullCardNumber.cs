using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AccountFullCardNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CardNumber",
                schema: "finance",
                table: "Accounts",
                type: "nvarchar(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Account_CardNumber",
                schema: "finance",
                table: "Accounts",
                sql: "[CardNumber] IS NULL OR ([Type] IN ('Bank','CreditCard') AND LEN([CardNumber]) BETWEEN 5 AND 30 AND [CardNumber] NOT LIKE '%[^0-9]%' AND [CardLastFour] IS NOT NULL AND RIGHT([CardNumber],4)=[CardLastFour])");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Account_CardNumber",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "CardNumber",
                schema: "finance",
                table: "Accounts");
        }
    }
}
