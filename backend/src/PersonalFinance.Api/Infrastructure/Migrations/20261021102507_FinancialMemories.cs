using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FinancialMemories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "FinancialMemory",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Key = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Favorite = table.Column<bool>(type: "bit", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FinancialMemory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FinancialMemory_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_FinancialMemory_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_FinancialMemory_TransactionId",
                schema: "finance",
                table: "FinancialMemory",
                column: "TransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_FinancialMemory_UserId_Key",
                schema: "finance",
                table: "FinancialMemory",
                columns: new[] { "UserId", "Key" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "FinancialMemory",
                schema: "finance");
        }
    }
}
