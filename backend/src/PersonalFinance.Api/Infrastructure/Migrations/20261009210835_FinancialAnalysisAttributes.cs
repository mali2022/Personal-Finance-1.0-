using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FinancialAnalysisAttributes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TransactionAnalysisAttribute",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    CategoryId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Behavior = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TransactionAnalysisAttribute", x => x.Id);
                    table.CheckConstraint("CK_AnalysisAttribute_Values", "([CategoryId] IS NULL AND [TransactionId] IS NOT NULL OR [CategoryId] IS NOT NULL AND [TransactionId] IS NULL) AND [Behavior] IN ('Unknown','FixedExpense','VariableExpense','FixedIncome','VariableIncome','OneTimeIncome','OtherIncome') AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_TransactionAnalysisAttribute_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalSchema: "finance",
                        principalTable: "Categories",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TransactionAnalysisAttribute_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TransactionAnalysisAttribute_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_TransactionAnalysisAttribute_CategoryId",
                schema: "finance",
                table: "TransactionAnalysisAttribute",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_TransactionAnalysisAttribute_TransactionId",
                schema: "finance",
                table: "TransactionAnalysisAttribute",
                column: "TransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_TransactionAnalysisAttribute_UserId_CategoryId",
                schema: "finance",
                table: "TransactionAnalysisAttribute",
                columns: new[] { "UserId", "CategoryId" },
                unique: true,
                filter: "[CategoryId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_TransactionAnalysisAttribute_UserId_TransactionId",
                schema: "finance",
                table: "TransactionAnalysisAttribute",
                columns: new[] { "UserId", "TransactionId" },
                unique: true,
                filter: "[TransactionId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TransactionAnalysisAttribute",
                schema: "finance");
        }
    }
}
