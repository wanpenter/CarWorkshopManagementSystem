using CarWorkshop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CarWorkshop.Infrastructure.Data.Configurations;

internal sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.ToTable("AuditLogs");
        builder.HasKey(entry => entry.Id);

        builder.Property(entry => entry.ActorUsername)
            .HasMaxLength(AuditLog.MaxActorUsernameLength)
            .IsRequired();

        builder.Property(entry => entry.ActorRole)
            .HasMaxLength(AuditLog.MaxActorRoleLength)
            .IsRequired();

        builder.Property(entry => entry.Action)
            .HasMaxLength(AuditLog.MaxActionLength)
            .IsRequired();

        builder.Property(entry => entry.EntityType)
            .HasMaxLength(AuditLog.MaxEntityTypeLength)
            .IsRequired();

        builder.Property(entry => entry.Summary)
            .HasMaxLength(AuditLog.MaxSummaryLength)
            .IsRequired();

        builder.Property(entry => entry.OldValuesJson)
            .HasColumnType("longtext");

        builder.Property(entry => entry.NewValuesJson)
            .HasColumnType("longtext");

        builder.Property(entry => entry.CreatedAtUtc)
            .HasConversion(
                value => value,
                value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
            .IsRequired();

        builder.HasOne(entry => entry.User)
            .WithMany()
            .HasForeignKey(entry => entry.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(entry => entry.CreatedAtUtc);
        builder.HasIndex(entry => new { entry.EntityType, entry.EntityId });
        builder.HasIndex(entry => entry.Action);
    }
}
