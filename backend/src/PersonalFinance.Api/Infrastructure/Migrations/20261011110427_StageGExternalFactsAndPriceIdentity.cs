using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StageGExternalFactsAndPriceIdentity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Brand",
                schema: "finance",
                table: "ProductPriceObservation",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "Discontinued",
                schema: "finance",
                table: "ProductPriceObservation",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "ListedAmount",
                schema: "finance",
                table: "ProductPriceObservation",
                type: "decimal(28,4)",
                precision: 28,
                scale: 4,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Merchant",
                schema: "finance",
                table: "ProductPriceObservation",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ProductCategory",
                schema: "finance",
                table: "ProductPriceObservation",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Brand",
                schema: "finance",
                table: "LivingCostBasketItem",
                type: "nvarchar(max)",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateTable(
                name: "ExternalPaymentFact",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Payer = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Consumer = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Nature = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExternalPaymentFact", x => x.Id);
                    table.CheckConstraint("CK_ExternalPaymentFact", "[Amount]>0 AND [Nature] IN ('Gift','PromisedRepayment','ReferenceOnly') AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_ExternalPaymentFact_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_ProductListedAmount",
                schema: "finance",
                table: "ProductPriceObservation",
                sql: "[ListedAmount] IS NULL OR [ListedAmount]>=[Amount]");

            migrationBuilder.CreateIndex(
                name: "IX_ExternalPaymentFact_UserId_OccurredAt",
                schema: "finance",
                table: "ExternalPaymentFact",
                columns: new[] { "UserId", "OccurredAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ExternalPaymentFact",
                schema: "finance");

            migrationBuilder.DropCheckConstraint(
                name: "CK_ProductListedAmount",
                schema: "finance",
                table: "ProductPriceObservation");

            migrationBuilder.DropColumn(
                name: "Brand",
                schema: "finance",
                table: "ProductPriceObservation");

            migrationBuilder.DropColumn(
                name: "Discontinued",
                schema: "finance",
                table: "ProductPriceObservation");

            migrationBuilder.DropColumn(
                name: "ListedAmount",
                schema: "finance",
                table: "ProductPriceObservation");

            migrationBuilder.DropColumn(
                name: "Merchant",
                schema: "finance",
                table: "ProductPriceObservation");

            migrationBuilder.DropColumn(
                name: "ProductCategory",
                schema: "finance",
                table: "ProductPriceObservation");

            migrationBuilder.DropColumn(
                name: "Brand",
                schema: "finance",
                table: "LivingCostBasketItem");
        }
    }
}
