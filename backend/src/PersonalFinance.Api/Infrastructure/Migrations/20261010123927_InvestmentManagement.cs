using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InvestmentManagement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "InvestmentAsset",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Code = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Market = table.Column<string>(type: "nvarchar(80)", maxLength: 80, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Unit = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvestmentAsset", x => x.Id);
                    table.CheckConstraint("CK_InvestmentAsset", "[Currency] IN ('CNY','USD','HKD') AND [State] IN ('Active','Archived') AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_InvestmentAsset_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_InvestmentAsset_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "InvestmentHistory",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AssetId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ResourceId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    SnapshotJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvestmentHistory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvestmentHistory_InvestmentAsset_AssetId",
                        column: x => x.AssetId,
                        principalSchema: "finance",
                        principalTable: "InvestmentAsset",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_InvestmentHistory_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "InvestmentTrade",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AssetId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    SettlementDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(28,8)", precision: 28, scale: 8, nullable: false),
                    Price = table.Column<decimal>(type: "decimal(28,8)", precision: 28, scale: 8, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Commission = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Tax = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    OtherFee = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    OwnsTransaction = table.Column<bool>(type: "bit", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvestmentTrade", x => x.Id);
                    table.CheckConstraint("CK_InvestmentTrade", "[Quantity]>=0 AND [Price]>=0 AND [Amount]>0 AND [Commission]>=0 AND [Tax]>=0 AND [OtherFee]>=0 AND [SettlementDate]>=[Date] AND [State] IN ('Active','Revoked') AND [Type] IN ('Buy','Sell','Dividend','Interest','Fee') AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_InvestmentTrade_InvestmentAsset_AssetId",
                        column: x => x.AssetId,
                        principalSchema: "finance",
                        principalTable: "InvestmentAsset",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_InvestmentTrade_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_InvestmentTrade_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "InvestmentValuation",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AssetId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Price = table.Column<decimal>(type: "decimal(28,8)", precision: 28, scale: 8, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Method = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvestmentValuation", x => x.Id);
                    table.CheckConstraint("CK_InvestmentValuation", "[Price]>=0 AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_InvestmentValuation_InvestmentAsset_AssetId",
                        column: x => x.AssetId,
                        principalSchema: "finance",
                        principalTable: "InvestmentAsset",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_InvestmentValuation_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentAsset_AccountId",
                schema: "finance",
                table: "InvestmentAsset",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentAsset_UserId_AccountId_Market_Type_Code",
                schema: "finance",
                table: "InvestmentAsset",
                columns: new[] { "UserId", "AccountId", "Market", "Type", "Code" },
                unique: true,
                filter: "[Code] <> ''");

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentHistory_AssetId",
                schema: "finance",
                table: "InvestmentHistory",
                column: "AssetId");

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentHistory_UserId_AssetId_CreatedAt",
                schema: "finance",
                table: "InvestmentHistory",
                columns: new[] { "UserId", "AssetId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentTrade_AssetId",
                schema: "finance",
                table: "InvestmentTrade",
                column: "AssetId");

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentTrade_TransactionId",
                schema: "finance",
                table: "InvestmentTrade",
                column: "TransactionId",
                unique: true,
                filter: "[TransactionId] IS NOT NULL AND [State]='Active'");

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentTrade_UserId_AssetId_Date_CreatedAt",
                schema: "finance",
                table: "InvestmentTrade",
                columns: new[] { "UserId", "AssetId", "Date", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentValuation_AssetId",
                schema: "finance",
                table: "InvestmentValuation",
                column: "AssetId");

            migrationBuilder.CreateIndex(
                name: "IX_InvestmentValuation_UserId_AssetId_Date",
                schema: "finance",
                table: "InvestmentValuation",
                columns: new[] { "UserId", "AssetId", "Date" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("IF EXISTS(SELECT 1 FROM finance.InvestmentAsset) OR EXISTS(SELECT 1 FROM finance.InvestmentTrade) OR EXISTS(SELECT 1 FROM finance.InvestmentValuation) OR EXISTS(SELECT 1 FROM finance.InvestmentHistory) THROW 51000,'Investment history prevents rollback; use verified backup recovery.',1;");
            migrationBuilder.DropTable(
                name: "InvestmentHistory",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "InvestmentTrade",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "InvestmentValuation",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "InvestmentAsset",
                schema: "finance");
        }
    }
}

