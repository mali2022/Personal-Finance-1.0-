using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PromotionInventoryCashbacks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CashbackReceivable",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    SettlementTransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Treatment = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CashbackReceivable", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CashbackReceivable_Transactions_SettlementTransactionId",
                        column: x => x.SettlementTransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CashbackReceivable_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_CashbackReceivable_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PromotionBenefit",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Platform = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Merchant = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Mode = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    FaceValue = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    MinimumAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    RemainingValue = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    StartsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ExpiresAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Rules = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PromotionBenefit", x => x.Id);
                    table.CheckConstraint("CK_PromotionBenefit", "[Quantity]>=0 AND [FaceValue]>=0 AND [RemainingValue]>=0 AND [MinimumAmount]>=0 AND [ExpiresAt]>=[StartsAt]");
                    table.ForeignKey(
                        name: "FK_PromotionBenefit_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PromotionBenefit_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PromotionUsage",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    BenefitId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PromotionUsage", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PromotionUsage_PromotionBenefit_BenefitId",
                        column: x => x.BenefitId,
                        principalSchema: "finance",
                        principalTable: "PromotionBenefit",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PromotionUsage_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PromotionUsage_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_CashbackReceivable_SettlementTransactionId",
                schema: "finance",
                table: "CashbackReceivable",
                column: "SettlementTransactionId",
                unique: true,
                filter: "[SettlementTransactionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CashbackReceivable_TransactionId",
                schema: "finance",
                table: "CashbackReceivable",
                column: "TransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_CashbackReceivable_UserId",
                schema: "finance",
                table: "CashbackReceivable",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PromotionBenefit_AccountId",
                schema: "finance",
                table: "PromotionBenefit",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_PromotionBenefit_UserId_State_ExpiresAt",
                schema: "finance",
                table: "PromotionBenefit",
                columns: new[] { "UserId", "State", "ExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PromotionUsage_BenefitId",
                schema: "finance",
                table: "PromotionUsage",
                column: "BenefitId");

            migrationBuilder.CreateIndex(
                name: "IX_PromotionUsage_TransactionId",
                schema: "finance",
                table: "PromotionUsage",
                column: "TransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_PromotionUsage_UserId_TransactionId_BenefitId",
                schema: "finance",
                table: "PromotionUsage",
                columns: new[] { "UserId", "TransactionId", "BenefitId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CashbackReceivable",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PromotionUsage",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "PromotionBenefit",
                schema: "finance");
        }
    }
}
