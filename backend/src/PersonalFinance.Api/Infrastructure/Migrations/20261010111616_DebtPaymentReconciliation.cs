using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DebtPaymentReconciliation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DebtPaymentAllocation",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    PlanId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    Component = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Explanation = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DebtPaymentAllocation", x => x.Id);
                    table.CheckConstraint("CK_DebtAllocation", "[Amount]>0 AND [Sequence]>0 AND [Component] IN ('Principal','Fee') AND [State] IN ('Active','Revoked')");
                    table.ForeignKey(
                        name: "FK_DebtPaymentAllocation_DebtRepaymentPlan_PlanId",
                        column: x => x.PlanId,
                        principalSchema: "finance",
                        principalTable: "DebtRepaymentPlan",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_DebtPaymentAllocation_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_DebtPaymentAllocation_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_DebtPaymentAllocation_PlanId",
                schema: "finance",
                table: "DebtPaymentAllocation",
                column: "PlanId");

            migrationBuilder.CreateIndex(
                name: "IX_DebtPaymentAllocation_TransactionId",
                schema: "finance",
                table: "DebtPaymentAllocation",
                column: "TransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_DebtPaymentAllocation_UserId_PlanId_Sequence",
                schema: "finance",
                table: "DebtPaymentAllocation",
                columns: new[] { "UserId", "PlanId", "Sequence" });

            migrationBuilder.CreateIndex(
                name: "IX_DebtPaymentAllocation_UserId_TransactionId_State",
                schema: "finance",
                table: "DebtPaymentAllocation",
                columns: new[] { "UserId", "TransactionId", "State" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DebtPaymentAllocation",
                schema: "finance");
        }
    }
}
