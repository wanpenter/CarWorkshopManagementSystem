using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CarWorkshop.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkshopAuthentication : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "WorkshopUsers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    Username = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    NormalizedUsername = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    FullName = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    PasswordHash = table.Column<string>(type: "varchar(512)", maxLength: 512, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    Role = table.Column<string>(type: "varchar(10)", maxLength: 10, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    IsActive = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    FailedLoginCount = table.Column<int>(type: "int", nullable: false),
                    LockoutEndUtc = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkshopUsers", x => x.Id);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "WorkshopSessions",
                columns: table => new
                {
                    Id = table.Column<string>(type: "char(32)", fixedLength: true, maxLength: 32, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    WorkshopUserId = table.Column<int>(type: "int", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    RevokedAtUtc = table.Column<DateTime>(type: "datetime(6)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WorkshopSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkshopSessions_WorkshopUsers_WorkshopUserId",
                        column: x => x.WorkshopUserId,
                        principalTable: "WorkshopUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_WorkshopSessions_ExpiresAtUtc",
                table: "WorkshopSessions",
                column: "ExpiresAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_WorkshopSessions_WorkshopUserId_RevokedAtUtc",
                table: "WorkshopSessions",
                columns: new[] { "WorkshopUserId", "RevokedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_WorkshopUsers_NormalizedUsername",
                table: "WorkshopUsers",
                column: "NormalizedUsername",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkshopUsers_Role_IsActive",
                table: "WorkshopUsers",
                columns: new[] { "Role", "IsActive" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "WorkshopSessions");

            migrationBuilder.DropTable(
                name: "WorkshopUsers");
        }
    }
}
