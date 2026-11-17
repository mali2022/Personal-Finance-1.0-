using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class RecurringPlanning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RecurringRules",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Amount = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ToAccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    CategoryId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    PayloadJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    StartLocal = table.Column<DateTime>(type: "datetime2", nullable: false),
                    EndLocal = table.Column<DateTime>(type: "datetime2", nullable: true),
                    TimeZone = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Frequency = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Interval = table.Column<int>(type: "int", nullable: false),
                    MonthEndPolicy = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    NextSequence = table.Column<long>(type: "bigint", nullable: false),
                    NextAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ReminderDays = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecurringRules", x => x.Id);
                    table.CheckConstraint("CK_Recurring_Schedule", "[Interval] BETWEEN 1 AND 366 AND [ReminderDays] BETWEEN 0 AND 90 AND [NextSequence]>=0 AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_RecurringRules_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RecurringRules_Accounts_ToAccountId",
                        column: x => x.ToAccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RecurringRules_Categories_CategoryId",
                        column: x => x.CategoryId,
                        principalSchema: "finance",
                        principalTable: "Categories",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RecurringRules_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "RecurringOccurrences",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    RuleId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Sequence = table.Column<long>(type: "bigint", nullable: false),
                    ScheduledAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    PayloadJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Amount = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    RuleVersion = table.Column<long>(type: "bigint", nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecurringOccurrences", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RecurringOccurrences_RecurringRules_RuleId",
                        column: x => x.RuleId,
                        principalSchema: "finance",
                        principalTable: "RecurringRules",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RecurringOccurrences_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RecurringOccurrences_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "RecurringExecutions",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    RuleId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    OccurrenceId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Action = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    OperationKey = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: true),
                    Message = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecurringExecutions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RecurringExecutions_RecurringOccurrences_OccurrenceId",
                        column: x => x.OccurrenceId,
                        principalSchema: "finance",
                        principalTable: "RecurringOccurrences",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RecurringExecutions_RecurringRules_RuleId",
                        column: x => x.RuleId,
                        principalSchema: "finance",
                        principalTable: "RecurringRules",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_RecurringExecutions_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_RecurringExecutions_OccurrenceId",
                schema: "finance",
                table: "RecurringExecutions",
                column: "OccurrenceId");

            migrationBuilder.CreateIndex(
                name: "IX_RecurringExecutions_RuleId",
                schema: "finance",
                table: "RecurringExecutions",
                column: "RuleId");

            migrationBuilder.CreateIndex(
                name: "IX_RecurringExecutions_UserId_RuleId_CreatedAt",
                schema: "finance",
                table: "RecurringExecutions",
                columns: new[] { "UserId", "RuleId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RecurringOccurrences_RuleId_ScheduledAt",
                schema: "finance",
                table: "RecurringOccurrences",
                columns: new[] { "RuleId", "ScheduledAt" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RecurringOccurrences_RuleId_Sequence",
                schema: "finance",
                table: "RecurringOccurrences",
                columns: new[] { "RuleId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RecurringOccurrences_TransactionId",
                schema: "finance",
                table: "RecurringOccurrences",
                column: "TransactionId",
                unique: true,
                filter: "[TransactionId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_RecurringOccurrences_UserId_State_ScheduledAt",
                schema: "finance",
                table: "RecurringOccurrences",
                columns: new[] { "UserId", "State", "ScheduledAt" });

            migrationBuilder.CreateIndex(
                name: "IX_RecurringRules_AccountId",
                schema: "finance",
                table: "RecurringRules",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_RecurringRules_CategoryId",
                schema: "finance",
                table: "RecurringRules",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_RecurringRules_State_NextAt_UserId",
                schema: "finance",
                table: "RecurringRules",
                columns: new[] { "State", "NextAt", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_RecurringRules_ToAccountId",
                schema: "finance",
                table: "RecurringRules",
                column: "ToAccountId");

            migrationBuilder.CreateIndex(
                name: "IX_RecurringRules_UserId",
                schema: "finance",
                table: "RecurringRules",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RecurringExecutions",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "RecurringOccurrences",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "RecurringRules",
                schema: "finance");
        }
    }
}
