using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class FinancialPlanning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AnnualBudget",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Year = table.Column<int>(type: "int", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Total = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnnualBudget", x => x.Id);
                    table.CheckConstraint("CK_AnnualBudget_Values", "[Total]>=0 AND [Year] BETWEEN 1900 AND 9998 AND [Currency]='CNY' AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_AnnualBudget_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "BudgetAlertSetting",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ThresholdsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Enabled = table.Column<bool>(type: "bit", nullable: false),
                    Silent = table.Column<bool>(type: "bit", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BudgetAlertSetting", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BudgetAlertSetting_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "BudgetAlertState",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    BudgetId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Month = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Threshold = table.Column<int>(type: "int", nullable: false),
                    Used = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    EffectiveBudget = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Silent = table.Column<bool>(type: "bit", nullable: false),
                    Dismissed = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BudgetAlertState", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BudgetAlertState_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "BudgetCarryover",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    SourceMonth = table.Column<string>(type: "nvarchar(7)", maxLength: 7, nullable: false),
                    TargetMonth = table.Column<string>(type: "nvarchar(7)", maxLength: 7, nullable: false),
                    CategoryId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Rule = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Parameter = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Cap = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: true),
                    CarryOverspend = table.Column<bool>(type: "bit", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    SourceFingerprint = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BudgetCarryover", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BudgetCarryover_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalSchema: "finance",
                        principalTable: "Categories",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_BudgetCarryover_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "BudgetChangeHistory",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    BudgetId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    BeforeJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AfterJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    BeforeVersion = table.Column<long>(type: "bigint", nullable: false),
                    AfterVersion = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BudgetChangeHistory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BudgetChangeHistory_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "BudgetTemplate",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    BudgetJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BudgetTemplate", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BudgetTemplate_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "CashFlowScenario",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CashFlowScenario", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CashFlowScenario_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "EssentialExpensePolicy",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    CategoryId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Necessity = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EssentialRate = table.Column<decimal>(type: "decimal(28,8)", precision: 28, scale: 8, nullable: false),
                    Excluded = table.Column<bool>(type: "bit", nullable: false),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EssentialExpensePolicy", x => x.Id);
                    table.CheckConstraint("CK_EssentialPolicy_Values", "([CategoryId] IS NULL AND [TransactionId] IS NOT NULL OR [CategoryId] IS NOT NULL AND [TransactionId] IS NULL) AND [EssentialRate] BETWEEN 0 AND 100");
                    table.ForeignKey(
                        name: "FK_EssentialExpensePolicy_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalSchema: "finance",
                        principalTable: "Categories",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_EssentialExpensePolicy_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_EssentialExpensePolicy_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SavingsGoal",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Target = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    TargetDate = table.Column<DateOnly>(type: "date", nullable: false),
                    MonthlySaving = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Priority = table.Column<int>(type: "int", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SavingsGoal", x => x.Id);
                    table.CheckConstraint("CK_Goal_Values", "[Target]>0 AND [MonthlySaving]>=0 AND [TargetDate]>=[StartDate] AND [Priority] BETWEEN 1 AND 5 AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_SavingsGoal_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "AnnualBudgetAllocation",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AnnualBudgetId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Month = table.Column<int>(type: "int", nullable: false),
                    CategoryId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AnnualBudgetAllocation", x => x.Id);
                    table.CheckConstraint("CK_AnnualAllocation_Values", "[Amount]>=0 AND [Month] BETWEEN 0 AND 12 AND ([Month]>0 OR [CategoryId] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_AnnualBudgetAllocation_AnnualBudget_AnnualBudgetId",
                        column: x => x.AnnualBudgetId,
                        principalSchema: "finance",
                        principalTable: "AnnualBudget",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_AnnualBudgetAllocation_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalSchema: "finance",
                        principalTable: "Categories",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "FutureCashFlowItem",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    ExpectedDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ToAccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    ReceivedAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: true),
                    Certainty = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    ScenarioId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FutureCashFlowItem", x => x.Id);
                    table.CheckConstraint("CK_FutureCashflow_Amount", "[Amount]>0 AND ([ReceivedAmount] IS NULL OR [ReceivedAmount]>0) AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_FutureCashFlowItem_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_FutureCashFlowItem_Accounts_ToAccountId",
                        column: x => x.ToAccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_FutureCashFlowItem_CashFlowScenario_ScenarioId",
                        column: x => x.ScenarioId,
                        principalSchema: "finance",
                        principalTable: "CashFlowScenario",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_FutureCashFlowItem_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_FutureCashFlowItem_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "GoalAllocation",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    GoalId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GoalAllocation", x => x.Id);
                    table.CheckConstraint("CK_GoalAllocation_Amount", "[Amount]>=0 AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_GoalAllocation_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_GoalAllocation_SavingsGoal_GoalId",
                        column: x => x.GoalId,
                        principalSchema: "finance",
                        principalTable: "SavingsGoal",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_GoalAllocation_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "GoalAllocationHistory",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    GoalId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ToGoalId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Action = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Before = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    After = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GoalAllocationHistory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_GoalAllocationHistory_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_GoalAllocationHistory_SavingsGoal_GoalId",
                        column: x => x.GoalId,
                        principalSchema: "finance",
                        principalTable: "SavingsGoal",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_GoalAllocationHistory_SavingsGoal_ToGoalId",
                        column: x => x.ToGoalId,
                        principalSchema: "finance",
                        principalTable: "SavingsGoal",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_GoalAllocationHistory_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_AnnualBudget_UserId_Year",
                schema: "finance",
                table: "AnnualBudget",
                columns: new[] { "UserId", "Year" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AnnualBudgetAllocation_AnnualBudgetId_Month_CategoryId",
                schema: "finance",
                table: "AnnualBudgetAllocation",
                columns: new[] { "AnnualBudgetId", "Month", "CategoryId" },
                unique: true,
                filter: "[CategoryId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_AnnualBudgetAllocation_CategoryId",
                schema: "finance",
                table: "AnnualBudgetAllocation",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_BudgetAlertSetting_UserId",
                schema: "finance",
                table: "BudgetAlertSetting",
                column: "UserId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BudgetAlertState_UserId_BudgetId_Threshold",
                schema: "finance",
                table: "BudgetAlertState",
                columns: new[] { "UserId", "BudgetId", "Threshold" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BudgetCarryover_CategoryId",
                schema: "finance",
                table: "BudgetCarryover",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_BudgetCarryover_UserId_SourceMonth_TargetMonth_CategoryId",
                schema: "finance",
                table: "BudgetCarryover",
                columns: new[] { "UserId", "SourceMonth", "TargetMonth", "CategoryId" },
                unique: true,
                filter: "[CategoryId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_BudgetChangeHistory_UserId_BudgetId_CreatedAt",
                schema: "finance",
                table: "BudgetChangeHistory",
                columns: new[] { "UserId", "BudgetId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_BudgetTemplate_UserId_Name",
                schema: "finance",
                table: "BudgetTemplate",
                columns: new[] { "UserId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CashFlowScenario_UserId_State_Id",
                schema: "finance",
                table: "CashFlowScenario",
                columns: new[] { "UserId", "State", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_EssentialExpensePolicy_CategoryId",
                schema: "finance",
                table: "EssentialExpensePolicy",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_EssentialExpensePolicy_TransactionId",
                schema: "finance",
                table: "EssentialExpensePolicy",
                column: "TransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_EssentialExpensePolicy_UserId_CategoryId",
                schema: "finance",
                table: "EssentialExpensePolicy",
                columns: new[] { "UserId", "CategoryId" },
                unique: true,
                filter: "[CategoryId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EssentialExpensePolicy_UserId_TransactionId",
                schema: "finance",
                table: "EssentialExpensePolicy",
                columns: new[] { "UserId", "TransactionId" },
                unique: true,
                filter: "[TransactionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_FutureCashFlowItem_AccountId",
                schema: "finance",
                table: "FutureCashFlowItem",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_FutureCashFlowItem_ScenarioId",
                schema: "finance",
                table: "FutureCashFlowItem",
                column: "ScenarioId");

            migrationBuilder.CreateIndex(
                name: "IX_FutureCashFlowItem_ToAccountId",
                schema: "finance",
                table: "FutureCashFlowItem",
                column: "ToAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_FutureCashFlowItem_TransactionId",
                schema: "finance",
                table: "FutureCashFlowItem",
                column: "TransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_FutureCashFlowItem_UserId_State_ExpectedDate_Id",
                schema: "finance",
                table: "FutureCashFlowItem",
                columns: new[] { "UserId", "State", "ExpectedDate", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_FutureCashFlowItem_UserId_TransactionId",
                schema: "finance",
                table: "FutureCashFlowItem",
                columns: new[] { "UserId", "TransactionId" },
                unique: true,
                filter: "[TransactionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_GoalAllocation_AccountId",
                schema: "finance",
                table: "GoalAllocation",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_GoalAllocation_GoalId",
                schema: "finance",
                table: "GoalAllocation",
                column: "GoalId");

            migrationBuilder.CreateIndex(
                name: "IX_GoalAllocation_UserId_AccountId",
                schema: "finance",
                table: "GoalAllocation",
                columns: new[] { "UserId", "AccountId" });

            migrationBuilder.CreateIndex(
                name: "IX_GoalAllocation_UserId_GoalId_AccountId",
                schema: "finance",
                table: "GoalAllocation",
                columns: new[] { "UserId", "GoalId", "AccountId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_GoalAllocationHistory_AccountId",
                schema: "finance",
                table: "GoalAllocationHistory",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_GoalAllocationHistory_GoalId",
                schema: "finance",
                table: "GoalAllocationHistory",
                column: "GoalId");

            migrationBuilder.CreateIndex(
                name: "IX_GoalAllocationHistory_ToGoalId",
                schema: "finance",
                table: "GoalAllocationHistory",
                column: "ToGoalId");

            migrationBuilder.CreateIndex(
                name: "IX_GoalAllocationHistory_UserId_GoalId_CreatedAt",
                schema: "finance",
                table: "GoalAllocationHistory",
                columns: new[] { "UserId", "GoalId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SavingsGoal_UserId_State_Priority_Id",
                schema: "finance",
                table: "SavingsGoal",
                columns: new[] { "UserId", "State", "Priority", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AnnualBudgetAllocation",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "BudgetAlertSetting",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "BudgetAlertState",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "BudgetCarryover",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "BudgetChangeHistory",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "BudgetTemplate",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "EssentialExpensePolicy",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "FutureCashFlowItem",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "GoalAllocation",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "GoalAllocationHistory",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AnnualBudget",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "CashFlowScenario",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "SavingsGoal",
                schema: "finance");
        }
    }
}
