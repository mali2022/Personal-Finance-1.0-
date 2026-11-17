using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AccountManagementV2 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AccountCode",
                schema: "finance",
                table: "Accounts",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Alias",
                schema: "finance",
                table: "Accounts",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ArchivedAt",
                schema: "finance",
                table: "Accounts",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BillingMode",
                schema: "finance",
                table: "Accounts",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "Monthly");

            migrationBuilder.AddColumn<string>(
                name: "CardAlias",
                schema: "finance",
                table: "Accounts",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CardBrand",
                schema: "finance",
                table: "Accounts",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CardHolderName",
                schema: "finance",
                table: "Accounts",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CardLastFour",
                schema: "finance",
                table: "Accounts",
                type: "nvarchar(4)",
                maxLength: 4,
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "ClosedAt",
                schema: "finance",
                table: "Accounts",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContractNumber",
                schema: "finance",
                table: "Accounts",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAt",
                schema: "finance",
                table: "Accounts",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Description",
                schema: "finance",
                table: "Accounts",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "GroupId",
                schema: "finance",
                table: "Accounts",
                type: "nvarchar(36)",
                maxLength: 36,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDefaultExpense",
                schema: "finance",
                table: "Accounts",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsDefaultIncome",
                schema: "finance",
                table: "Accounts",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsPinned",
                schema: "finance",
                table: "Accounts",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "LoanPurpose",
                schema: "finance",
                table: "Accounts",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateOnly>(
                name: "OpenedAt",
                schema: "finance",
                table: "Accounts",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SortOrder",
                schema: "finance",
                table: "Accounts",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "AccountGroup",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AccountGroup", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AccountGroup_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_Accounts_GroupId",
                schema: "finance",
                table: "Accounts",
                column: "GroupId");

            migrationBuilder.CreateIndex(
                name: "IX_Accounts_UserId_GroupId_IsPinned_SortOrder",
                schema: "finance",
                table: "Accounts",
                columns: new[] { "UserId", "GroupId", "IsPinned", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "UX_Account_DefaultExpense",
                schema: "finance",
                table: "Accounts",
                columns: new[] { "UserId", "IsDefaultExpense" },
                unique: true,
                filter: "[IsDefaultExpense]=1");

            migrationBuilder.CreateIndex(
                name: "UX_Account_DefaultIncome",
                schema: "finance",
                table: "Accounts",
                columns: new[] { "UserId", "IsDefaultIncome" },
                unique: true,
                filter: "[IsDefaultIncome]=1");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Account_Management",
                schema: "finance",
                table: "Accounts",
                sql: "[SortOrder]>=0 AND ([CardLastFour] IS NULL OR ([Type] IN ('Bank','CreditCard') AND LEN([CardLastFour])=4 AND [CardLastFour] NOT LIKE '%[^0-9]%')) AND ([Type] NOT IN ('ConsumerLoan','SecuredLoan') OR [OpeningBalance]=0)");

            migrationBuilder.CreateIndex(
                name: "IX_AccountGroup_UserId_Name",
                schema: "finance",
                table: "AccountGroup",
                columns: new[] { "UserId", "Name" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Accounts_AccountGroup_GroupId",
                schema: "finance",
                table: "Accounts",
                column: "GroupId",
                principalSchema: "finance",
                principalTable: "AccountGroup",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Accounts_AccountGroup_GroupId",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropTable(
                name: "AccountGroup",
                schema: "finance");

            migrationBuilder.DropIndex(
                name: "IX_Accounts_GroupId",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropIndex(
                name: "IX_Accounts_UserId_GroupId_IsPinned_SortOrder",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropIndex(
                name: "UX_Account_DefaultExpense",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropIndex(
                name: "UX_Account_DefaultIncome",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Account_Management",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "AccountCode",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "Alias",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "ArchivedAt",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "BillingMode",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "CardAlias",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "CardBrand",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "CardHolderName",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "CardLastFour",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "ClosedAt",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "ContractNumber",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "Description",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "GroupId",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "IsDefaultExpense",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "IsDefaultIncome",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "IsPinned",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "LoanPurpose",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "OpenedAt",
                schema: "finance",
                table: "Accounts");

            migrationBuilder.DropColumn(
                name: "SortOrder",
                schema: "finance",
                table: "Accounts");
        }
    }
}
