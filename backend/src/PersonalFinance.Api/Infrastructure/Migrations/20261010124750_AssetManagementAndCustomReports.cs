using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AssetManagementAndCustomReports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AssetAggregationPolicy",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Mode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AssetAggregationPolicy", x => x.Id);
                    table.CheckConstraint("CK_AggregationPolicy", "[Mode] IN ('Unknown','CashOnly','TotalAssets') AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_AssetAggregationPolicy_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_AssetAggregationPolicy_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CustomReportDefinition",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    DefinitionJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomReportDefinition", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomReportDefinition_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "FxValuationRate",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    BaseCurrency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    TargetCurrency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Rate = table.Column<decimal>(type: "decimal(28,8)", precision: 28, scale: 8, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Source = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FxValuationRate", x => x.Id);
                    table.CheckConstraint("CK_FxValuation", "[Rate]>0 AND [BaseCurrency]<>[TargetCurrency] AND [BaseCurrency] IN ('CNY','USD','HKD') AND [TargetCurrency] IN ('CNY','USD','HKD') AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_FxValuationRate_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ManagedAsset",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    LiabilityAccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    FundingTransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    SettlementTransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    InterestTransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Cost = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    AcquiredDate = table.Column<DateOnly>(type: "date", nullable: false),
                    MaturityDate = table.Column<DateOnly>(type: "date", nullable: true),
                    AnnualRate = table.Column<decimal>(type: "decimal(28,8)", precision: 28, scale: 8, nullable: false),
                    DayCount = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Institution = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    MaturityAction = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManagedAsset", x => x.Id);
                    table.CheckConstraint("CK_ManagedAsset", "[Cost]>=0 AND [AnnualRate] BETWEEN 0 AND 100 AND [Currency] IN ('CNY','USD','HKD') AND [Version]>0 AND [State] IN ('Active','Archived','Matured','EarlyWithdrawn')");
                    table.ForeignKey(
                        name: "FK_ManagedAsset_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ManagedAsset_Accounts_LiabilityAccountId",
                        column: x => x.LiabilityAccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ManagedAsset_Transactions_FundingTransactionId",
                        column: x => x.FundingTransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ManagedAsset_Transactions_InterestTransactionId",
                        column: x => x.InterestTransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ManagedAsset_Transactions_SettlementTransactionId",
                        column: x => x.SettlementTransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ManagedAsset_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ManagedAssetValuation",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AssetId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManagedAssetValuation", x => x.Id);
                    table.CheckConstraint("CK_ManagedValuation", "[Amount]>=0 AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_ManagedAssetValuation_ManagedAsset_AssetId",
                        column: x => x.AssetId,
                        principalSchema: "finance",
                        principalTable: "ManagedAsset",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ManagedAssetValuation_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_AssetAggregationPolicy_AccountId",
                schema: "finance",
                table: "AssetAggregationPolicy",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_AssetAggregationPolicy_UserId_AccountId",
                schema: "finance",
                table: "AssetAggregationPolicy",
                columns: new[] { "UserId", "AccountId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CustomReportDefinition_UserId_Name",
                schema: "finance",
                table: "CustomReportDefinition",
                columns: new[] { "UserId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FxValuationRate_UserId_BaseCurrency_TargetCurrency_Date_CreatedAt",
                schema: "finance",
                table: "FxValuationRate",
                columns: new[] { "UserId", "BaseCurrency", "TargetCurrency", "Date", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ManagedAsset_AccountId",
                schema: "finance",
                table: "ManagedAsset",
                column: "AccountId",
                unique: true,
                filter: "[AccountId] IS NOT NULL AND [State]='Active'");

            migrationBuilder.CreateIndex(
                name: "IX_ManagedAsset_FundingTransactionId",
                schema: "finance",
                table: "ManagedAsset",
                column: "FundingTransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_ManagedAsset_InterestTransactionId",
                schema: "finance",
                table: "ManagedAsset",
                column: "InterestTransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_ManagedAsset_LiabilityAccountId",
                schema: "finance",
                table: "ManagedAsset",
                column: "LiabilityAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_ManagedAsset_SettlementTransactionId",
                schema: "finance",
                table: "ManagedAsset",
                column: "SettlementTransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_ManagedAsset_UserId_Type_State_MaturityDate",
                schema: "finance",
                table: "ManagedAsset",
                columns: new[] { "UserId", "Type", "State", "MaturityDate" });

            migrationBuilder.CreateIndex(
                name: "IX_ManagedAssetValuation_AssetId",
                schema: "finance",
                table: "ManagedAssetValuation",
                column: "AssetId");

            migrationBuilder.CreateIndex(
                name: "IX_ManagedAssetValuation_UserId_AssetId_Date_CreatedAt",
                schema: "finance",
                table: "ManagedAssetValuation",
                columns: new[] { "UserId", "AssetId", "Date", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("IF EXISTS(SELECT 1 FROM finance.ManagedAsset) OR EXISTS(SELECT 1 FROM finance.ManagedAssetValuation) OR EXISTS(SELECT 1 FROM finance.FxValuationRate) OR EXISTS(SELECT 1 FROM finance.AssetAggregationPolicy) OR EXISTS(SELECT 1 FROM finance.CustomReportDefinition) THROW 51000,'Asset management data prevents rollback; use verified backup recovery.',1;");
            migrationBuilder.DropTable(
                name: "AssetAggregationPolicy",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "CustomReportDefinition",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "FxValuationRate",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "ManagedAssetValuation",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "ManagedAsset",
                schema: "finance");
        }
    }
}

