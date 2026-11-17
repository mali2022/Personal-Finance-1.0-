using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class StageGAdvancePurchasePlans : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AdvancePurchasePlan",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    CancellationReason = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Counterparty = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    PlannedAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    PlannedOwnAmount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    Quantity = table.Column<decimal>(type: "decimal(28,8)", precision: 28, scale: 8, nullable: false),
                    Unit = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    AdvanceId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AdvancePurchasePlan", x => x.Id);
                    table.CheckConstraint("CK_AdvancePurchasePlan", "[PlannedAmount]>0 AND [PlannedOwnAmount]>=0 AND [PlannedOwnAmount]<=[PlannedAmount] AND [Quantity]>0 AND [Version]>0");
                    table.ForeignKey(
                        name: "FK_AdvancePurchasePlan_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_AdvancePurchasePlan_ThirdPartyAdvance_AdvanceId",
                        column: x => x.AdvanceId,
                        principalSchema: "finance",
                        principalTable: "ThirdPartyAdvance",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_AdvancePurchasePlan_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_AdvancePurchasePlan_AccountId",
                schema: "finance",
                table: "AdvancePurchasePlan",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_AdvancePurchasePlan_AdvanceId",
                schema: "finance",
                table: "AdvancePurchasePlan",
                column: "AdvanceId",
                unique: true,
                filter: "[AdvanceId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_AdvancePurchasePlan_UserId",
                schema: "finance",
                table: "AdvancePurchasePlan",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AdvancePurchasePlan",
                schema: "finance");
        }
    }
}
