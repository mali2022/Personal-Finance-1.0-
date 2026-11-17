using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AiPersonalReadAccess : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "PersonalReadAccess",
                schema: "finance",
                table: "AiPrivacySetting",
                type: "bit",
                nullable: false,
                defaultValue: true);
            // Preserve previously selected transmission restrictions. New settings default
            // to personal read access; existing users can opt into the upgraded policy once.
            migrationBuilder.Sql("UPDATE [finance].[AiPrivacySetting] SET [PersonalReadAccess] = 0;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PersonalReadAccess",
                schema: "finance",
                table: "AiPrivacySetting");
        }
    }
}
