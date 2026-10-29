using CarWorkshop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CarWorkshop.Infrastructure.Data.Configurations;

internal sealed class WorkshopUserConfiguration : IEntityTypeConfiguration<WorkshopUser>
{
    public void Configure(EntityTypeBuilder<WorkshopUser> builder)
    {
        builder.ToTable("WorkshopUsers");
        builder.HasKey(user => user.Id);

        builder.Property(user => user.Username)
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(user => user.NormalizedUsername)
            .HasMaxLength(50)
            .IsRequired();

        builder.HasIndex(user => user.NormalizedUsername)
            .IsUnique();

        builder.Property(user => user.FullName)
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(user => user.PasswordHash)
            .HasMaxLength(512)
            .IsRequired();

        builder.Property(user => user.Role)
            .HasMaxLength(10)
            .IsRequired();

        builder.HasIndex(user => new { user.Role, user.IsActive });

        builder.Property(user => user.LockoutEndUtc)
            .HasConversion(
                value => value,
                value => value.HasValue
                    ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc)
                    : null);

        builder.Property(user => user.CreatedAtUtc)
            .HasConversion(
                value => value,
                value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
            .IsRequired();

        builder.HasMany(user => user.Sessions)
            .WithOne(session => session.WorkshopUser)
            .HasForeignKey(session => session.WorkshopUserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
