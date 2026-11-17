using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AiAtomicQuotaReservations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "ReservedCost",
                schema: "finance",
                table: "AiUsageRecord",
                type: "decimal(20,10)",
                precision: 20,
                scale: 10,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "State",
                schema: "finance",
                table: "AiUsageRecord",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "Recorded");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReservedCost",
                schema: "finance",
                table: "AiUsageRecord");

            migrationBuilder.DropColumn(
                name: "State",
                schema: "finance",
                table: "AiUsageRecord");
        }
    }
}
