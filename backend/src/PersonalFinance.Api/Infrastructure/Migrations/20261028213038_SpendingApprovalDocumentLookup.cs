using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SpendingApprovalDocumentLookup : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Documents_UserId",
                schema: "finance",
                table: "Documents");

            migrationBuilder.CreateIndex(
                name: "IX_Documents_UserId_Kind_CreatedAt_Id",
                schema: "finance",
                table: "Documents",
                columns: new[] { "UserId", "Kind", "CreatedAt", "Id" })
                .Annotation("SqlServer:Include", new[] { "Name" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Documents_UserId_Kind_CreatedAt_Id",
                schema: "finance",
                table: "Documents");

            migrationBuilder.CreateIndex(
                name: "IX_Documents_UserId",
                schema: "finance",
                table: "Documents",
                column: "UserId");
        }
    }
}
