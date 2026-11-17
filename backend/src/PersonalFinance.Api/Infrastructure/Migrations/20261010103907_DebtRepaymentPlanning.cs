using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class DebtRepaymentPlanning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DebtRepaymentPlan",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    BusinessId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    OriginalTransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Principal = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Periods = table.Column<int>(type: "int", nullable: false),
                    FirstDate = table.Column<DateOnly>(type: "date", nullable: false),
                    RepaymentMode = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    FeeMode = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    PeriodRate = table.Column<decimal>(type: "decimal(28,8)", precision: 28, scale: 8, nullable: false),
                    FixedFee = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ScheduleJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    StatementAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: true),
                    MinimumPayment = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: true),
                    MinimumDueDate = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DebtRepaymentPlan", x => x.Id);
                    table.CheckConstraint("CK_DebtPlan_Values", "[Principal]>0 AND [Periods] BETWEEN 1 AND 600 AND [Version]>0 AND [Currency] IN ('CNY','USD','HKD') AND [PeriodRate] BETWEEN 0 AND 100 AND [FixedFee]>=0 AND [State] IN ('Active','Archived') AND (([Kind]='CreditInstallment' AND [BusinessId] IS NULL) OR ([Kind]='LoanRepayment' AND [BusinessId] IS NOT NULL AND [OriginalTransactionId] IS NULL)) AND ([MinimumPayment] IS NULL OR [MinimumPayment]>=0 AND [StatementAmount] IS NOT NULL AND [MinimumPayment]<=[StatementAmount])");
                    table.ForeignKey(
                        name: "FK_DebtRepaymentPlan_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_DebtRepaymentPlan_Businesses_BusinessId",
                        column: x => x.BusinessId,
                        principalSchema: "finance",
                        principalTable: "Businesses",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_DebtRepaymentPlan_Transactions_OriginalTransactionId",
                        column: x => x.OriginalTransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_DebtRepaymentPlan_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "DebtPlanHistory",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    PlanId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    SnapshotJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DebtPlanHistory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DebtPlanHistory_DebtRepaymentPlan_PlanId",
                        column: x => x.PlanId,
                        principalSchema: "finance",
                        principalTable: "DebtRepaymentPlan",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_DebtPlanHistory_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_DebtPlanHistory_PlanId",
                schema: "finance",
                table: "DebtPlanHistory",
                column: "PlanId");

            migrationBuilder.CreateIndex(
                name: "IX_DebtPlanHistory_UserId_PlanId_CreatedAt",
                schema: "finance",
                table: "DebtPlanHistory",
                columns: new[] { "UserId", "PlanId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_DebtRepaymentPlan_AccountId",
                schema: "finance",
                table: "DebtRepaymentPlan",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_DebtRepaymentPlan_BusinessId",
                schema: "finance",
                table: "DebtRepaymentPlan",
                column: "BusinessId");

            migrationBuilder.CreateIndex(
                name: "IX_DebtRepaymentPlan_OriginalTransactionId",
                schema: "finance",
                table: "DebtRepaymentPlan",
                column: "OriginalTransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_DebtRepaymentPlan_UserId_BusinessId",
                schema: "finance",
                table: "DebtRepaymentPlan",
                columns: new[] { "UserId", "BusinessId" },
                unique: true,
                filter: "[BusinessId] IS NOT NULL AND [State]='Active'");

            migrationBuilder.CreateIndex(
                name: "IX_DebtRepaymentPlan_UserId_Kind_State_Id",
                schema: "finance",
                table: "DebtRepaymentPlan",
                columns: new[] { "UserId", "Kind", "State", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_DebtRepaymentPlan_UserId_OriginalTransactionId",
                schema: "finance",
                table: "DebtRepaymentPlan",
                columns: new[] { "UserId", "OriginalTransactionId" },
                unique: true,
                filter: "[OriginalTransactionId] IS NOT NULL AND [State]='Active'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DebtPlanHistory",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "DebtRepaymentPlan",
                schema: "finance");
        }
    }
}
