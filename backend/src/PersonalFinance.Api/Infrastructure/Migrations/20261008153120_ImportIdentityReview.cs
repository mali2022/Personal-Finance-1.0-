using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class ImportIdentityReview : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "IdentityKey",
                schema: "finance",
                table: "ImportRows",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "IdentityVersion",
                schema: "finance",
                table: "ImportRows",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "ReviewDecision",
                schema: "finance",
                table: "ImportRows",
                type: "nvarchar(12)",
                maxLength: 12,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReviewSignature",
                schema: "finance",
                table: "ImportRows",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReviewedAt",
                schema: "finance",
                table: "ImportRows",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.Sql("""
                IF EXISTS (SELECT 1 FROM finance.ImportRows r LEFT JOIN finance.Imports j ON j.Id=r.ImportJobId
                    WHERE r.Status='Imported' AND (ISJSON(r.DataJson)<>1 OR j.AccountId IS NULL OR j.UserId<>r.UserId OR
                        j.Source NOT IN ('CSV','Excel','Alipay','WeChat','Bank') OR JSON_VALUE(r.DataJson,'$.accountId') IS NULL OR JSON_VALUE(r.DataJson,'$.accountId')<>j.AccountId OR
                        JSON_VALUE(r.DataJson,'$.currency') IS NULL OR JSON_VALUE(r.DataJson,'$.type') NOT IN ('Expense','Income','Transfer') OR
                        TRY_CONVERT(decimal(28,4),JSON_VALUE(r.DataJson,'$.amount')) IS NULL OR TRY_CONVERT(datetimeoffset,JSON_VALUE(r.DataJson,'$.occurredAt')) IS NULL))
                    THROW 51000,'Legacy import identity metadata requires review before migration',1;
                UPDATE r SET IdentityKey=CONVERT(varchar(64),HASHBYTES('SHA2_256',
                    CONVERT(varbinary(max),CONVERT(varchar(max),(N'v2|'+j.AccountId+N'|'+j.Source+N'|'+LTRIM(RTRIM(JSON_VALUE(r.DataJson,'$.externalId')))) COLLATE Latin1_General_100_BIN2_UTF8))),2)
                FROM finance.ImportRows r JOIN finance.Imports j ON j.Id=r.ImportJobId
                WHERE r.Status='Imported' AND NULLIF(LTRIM(RTRIM(JSON_VALUE(r.DataJson,'$.externalId'))),'') IS NOT NULL;
                IF EXISTS(SELECT 1 FROM finance.ImportRows WHERE Status='Imported' AND IdentityKey IS NOT NULL GROUP BY UserId,IdentityKey HAVING COUNT(*)>1)
                    THROW 51000,'Legacy deterministic import identities conflict; no automatic deletion is allowed',1;
                """);
            migrationBuilder.CreateIndex(
                name: "IX_ImportRows_UserId_IdentityKey",
                schema: "finance",
                table: "ImportRows",
                columns: new[] { "UserId", "IdentityKey" },
                unique: true,
                filter: "[Status] = 'Imported' AND [IdentityKey] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("IF EXISTS(SELECT 1 FROM finance.ImportRows WHERE (IdentityVersion=2 AND Status='Imported') OR ReviewDecision IS NOT NULL) THROW 51000,'V2 imports or decisions exist; preserve identity protection and use a forward repair',1;");
            migrationBuilder.DropIndex(
                name: "IX_ImportRows_UserId_IdentityKey",
                schema: "finance",
                table: "ImportRows");

            migrationBuilder.DropColumn(
                name: "IdentityKey",
                schema: "finance",
                table: "ImportRows");

            migrationBuilder.DropColumn(
                name: "IdentityVersion",
                schema: "finance",
                table: "ImportRows");

            migrationBuilder.DropColumn(
                name: "ReviewDecision",
                schema: "finance",
                table: "ImportRows");

            migrationBuilder.DropColumn(
                name: "ReviewSignature",
                schema: "finance",
                table: "ImportRows");

            migrationBuilder.DropColumn(
                name: "ReviewedAt",
                schema: "finance",
                table: "ImportRows");
        }
    }
}
