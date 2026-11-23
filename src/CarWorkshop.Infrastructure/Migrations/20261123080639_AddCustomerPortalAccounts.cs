using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CarWorkshop.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerPortalAccounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Role",
                table: "WorkshopUsers",
                type: "varchar(20)",
                maxLength: 20,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(10)",
                oldMaxLength: 10)
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.AddColumn<int>(
                name: "CustomerId",
                table: "WorkshopUsers",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_WorkshopUsers_CustomerId",
                table: "WorkshopUsers",
                column: "CustomerId",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_WorkshopUsers_Customers_CustomerId",
                table: "WorkshopUsers",
                column: "CustomerId",
                principalTable: "Customers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_WorkshopUsers_Customers_CustomerId",
                table: "WorkshopUsers");

            migrationBuilder.DropIndex(
                name: "IX_WorkshopUsers_CustomerId",
                table: "WorkshopUsers");

            migrationBuilder.DropColumn(
                name: "CustomerId",
                table: "WorkshopUsers");

            migrationBuilder.AlterColumn<string>(
                name: "Role",
                table: "WorkshopUsers",
                type: "varchar(10)",
                maxLength: 10,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(20)",
                oldMaxLength: 20)
                .Annotation("MySql:CharSet", "utf8mb4")
                .OldAnnotation("MySql:CharSet", "utf8mb4");
        }
    }
}
