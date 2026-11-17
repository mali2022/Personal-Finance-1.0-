using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace PersonalFinance.Api.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class PersonalInformationCenter : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
migrationBuilder.AddColumn<byte[]>(
                name: "AvatarPng",
                schema: "finance",
                table: "Users",
                type: "varbinary(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "AvatarUpdatedAt",
                schema: "finance",
                table: "Users",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Bio",
                schema: "finance",
                table: "Users",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateOnly>(
                name: "Birthday",
                schema: "finance",
                table: "Users",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "City",
                schema: "finance",
                table: "Users",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Country",
                schema: "finance",
                table: "Users",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Gender",
                schema: "finance",
                table: "Users",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Unspecified");

            migrationBuilder.AddColumn<string>(
                name: "Language",
                schema: "finance",
                table: "Users",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "zh-CN");

            migrationBuilder.AddColumn<string>(
                name: "Occupation",
                schema: "finance",
                table: "Users",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Phone",
                schema: "finance",
                table: "Users",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PreferredCurrency",
                schema: "finance",
                table: "Users",
                type: "nvarchar(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: "CNY");

            migrationBuilder.AddColumn<long>(
                name: "ProfileVersion",
                schema: "finance",
                table: "Users",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);

            migrationBuilder.AddColumn<string>(
                name: "RealName",
                schema: "finance",
                table: "Users",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Region",
                schema: "finance",
                table: "Users",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "TimeZone",
                schema: "finance",
                table: "Users",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: false,
                defaultValue: "Asia/Shanghai");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AvatarPng",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "AvatarUpdatedAt",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Bio",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Birthday",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "City",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Country",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Gender",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Language",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Occupation",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Phone",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "PreferredCurrency",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "ProfileVersion",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "RealName",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Region",
                schema: "finance",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "TimeZone",
                schema: "finance",
                table: "Users");

}
    }
}
