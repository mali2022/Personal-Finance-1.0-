using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SubscriptionAutomation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PreparedPayloadJson",
                schema: "finance",
                table: "RecurringOccurrences",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AutomationRules",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Priority = table.Column<int>(type: "int", nullable: false),
                    ConditionsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ActionsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PreviewOnly = table.Column<bool>(type: "bit", nullable: false),
                    HitCount = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AutomationRules", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AutomationRules_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Subscriptions",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    Provider = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: false),
                    RuleId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    AutoRenew = table.Column<bool>(type: "bit", nullable: false),
                    CancelledAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    ServiceEndsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    Note = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Subscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Subscriptions_RecurringRules_RuleId",
                        column: x => x.RuleId,
                        principalSchema: "finance",
                        principalTable: "RecurringRules",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Subscriptions_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "AutomationExecutions",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    RuleId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    OccurrenceId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ChangedFieldsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    OperationKey = table.Column<string>(type: "nvarchar(150)", maxLength: 150, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AutomationExecutions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AutomationExecutions_AutomationRules_RuleId",
                        column: x => x.RuleId,
                        principalSchema: "finance",
                        principalTable: "AutomationRules",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_AutomationExecutions_RecurringOccurrences_OccurrenceId",
                        column: x => x.OccurrenceId,
                        principalSchema: "finance",
                        principalTable: "RecurringOccurrences",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_AutomationExecutions_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SubscriptionPrices",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    SubscriptionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    EffectiveAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubscriptionPrices", x => x.Id);
                    table.CheckConstraint("CK_SubscriptionPrice_Amount", "[Amount]>0");
                    table.ForeignKey(
                        name: "FK_SubscriptionPrices_Subscriptions_SubscriptionId",
                        column: x => x.SubscriptionId,
                        principalSchema: "finance",
                        principalTable: "Subscriptions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SubscriptionPrices_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_AutomationExecutions_OccurrenceId",
                schema: "finance",
                table: "AutomationExecutions",
                column: "OccurrenceId");

            migrationBuilder.CreateIndex(
                name: "IX_AutomationExecutions_RuleId",
                schema: "finance",
                table: "AutomationExecutions",
                column: "RuleId");

            migrationBuilder.CreateIndex(
                name: "IX_AutomationExecutions_UserId_CreatedAt",
                schema: "finance",
                table: "AutomationExecutions",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AutomationRules_UserId_State_Priority_Id",
                schema: "finance",
                table: "AutomationRules",
                columns: new[] { "UserId", "State", "Priority", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionPrices_SubscriptionId_EffectiveAt",
                schema: "finance",
                table: "SubscriptionPrices",
                columns: new[] { "SubscriptionId", "EffectiveAt" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionPrices_UserId",
                schema: "finance",
                table: "SubscriptionPrices",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_Subscriptions_RuleId",
                schema: "finance",
                table: "Subscriptions",
                column: "RuleId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Subscriptions_UserId",
                schema: "finance",
                table: "Subscriptions",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AutomationExecutions",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "SubscriptionPrices",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "AutomationRules",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "Subscriptions",
                schema: "finance");

            migrationBuilder.DropColumn(
                name: "PreparedPayloadJson",
                schema: "finance",
                table: "RecurringOccurrences");
        }
    }
}
