using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SmartReconciliationEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StatementBalanceSnapshot",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    StartsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    EndsAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    OpeningBalance = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    BankClosingBalance = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    SystemClosingBalance = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    BankOnly = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    LedgerOnly = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    AdjustedDifference = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    EvidenceJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StatementBalanceSnapshot", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StatementBalanceSnapshot_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StatementBalanceSnapshot_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "StatementRecord",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ImportJobId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    ImportRowId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    IdentityHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    OccurredAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Merchant = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Resolution = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StatementRecord", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StatementRecord_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StatementRecord_ImportRows_ImportRowId",
                        column: x => x.ImportRowId,
                        principalSchema: "finance",
                        principalTable: "ImportRows",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StatementRecord_Imports_ImportJobId",
                        column: x => x.ImportJobId,
                        principalSchema: "finance",
                        principalTable: "Imports",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StatementRecord_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "StatementRule",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Merchant = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(3)", maxLength: 3, nullable: false),
                    Keyword = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DateTolerance = table.Column<int>(type: "int", nullable: false),
                    Priority = table.Column<int>(type: "int", nullable: false),
                    AmountTolerance = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    RequireReference = table.Column<bool>(type: "bit", nullable: false),
                    Enabled = table.Column<bool>(type: "bit", nullable: false),
                    AutoConfirm = table.Column<bool>(type: "bit", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StatementRule", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StatementRule_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalSchema: "finance",
                        principalTable: "Accounts",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StatementRule_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "StatementLink",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    StatementRecordId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    TransactionId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(28,4)", precision: 28, scale: 4, nullable: false),
                    TransactionVersion = table.Column<long>(type: "bigint", nullable: false),
                    EngineVersion = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    EvidenceJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    State = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<string>(type: "nvarchar(36)", maxLength: 36, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StatementLink", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StatementLink_StatementRecord_StatementRecordId",
                        column: x => x.StatementRecordId,
                        principalSchema: "finance",
                        principalTable: "StatementRecord",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StatementLink_Transactions_TransactionId",
                        column: x => x.TransactionId,
                        principalSchema: "finance",
                        principalTable: "Transactions",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_StatementLink_Users_UserId",
                        column: x => x.UserId,
                        principalSchema: "finance",
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_StatementBalanceSnapshot_AccountId",
                schema: "finance",
                table: "StatementBalanceSnapshot",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_StatementBalanceSnapshot_UserId_AccountId_CreatedAt",
                schema: "finance",
                table: "StatementBalanceSnapshot",
                columns: new[] { "UserId", "AccountId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StatementLink_StatementRecordId",
                schema: "finance",
                table: "StatementLink",
                column: "StatementRecordId");

            migrationBuilder.CreateIndex(
                name: "IX_StatementLink_TransactionId",
                schema: "finance",
                table: "StatementLink",
                column: "TransactionId");

            migrationBuilder.CreateIndex(
                name: "IX_StatementLink_UserId_AccountId_TransactionId",
                schema: "finance",
                table: "StatementLink",
                columns: new[] { "UserId", "AccountId", "TransactionId" },
                unique: true,
                filter: "[State] = N'Confirmed'");

            migrationBuilder.CreateIndex(
                name: "IX_StatementLink_UserId_StatementRecordId",
                schema: "finance",
                table: "StatementLink",
                columns: new[] { "UserId", "StatementRecordId" },
                unique: true,
                filter: "[State] = N'Confirmed'");

            migrationBuilder.CreateIndex(
                name: "IX_StatementRecord_AccountId",
                schema: "finance",
                table: "StatementRecord",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_StatementRecord_ImportJobId",
                schema: "finance",
                table: "StatementRecord",
                column: "ImportJobId");

            migrationBuilder.CreateIndex(
                name: "IX_StatementRecord_ImportRowId",
                schema: "finance",
                table: "StatementRecord",
                column: "ImportRowId");

            migrationBuilder.CreateIndex(
                name: "IX_StatementRecord_UserId_AccountId_IdentityHash",
                schema: "finance",
                table: "StatementRecord",
                columns: new[] { "UserId", "AccountId", "IdentityHash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StatementRecord_UserId_AccountId_State_OccurredAt",
                schema: "finance",
                table: "StatementRecord",
                columns: new[] { "UserId", "AccountId", "State", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StatementRule_AccountId",
                schema: "finance",
                table: "StatementRule",
                column: "AccountId");

            migrationBuilder.CreateIndex(
                name: "IX_StatementRule_UserId_AccountId_Priority",
                schema: "finance",
                table: "StatementRule",
                columns: new[] { "UserId", "AccountId", "Priority" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StatementBalanceSnapshot",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "StatementLink",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "StatementRule",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "StatementRecord",
                schema: "finance");
        }
    }
}
