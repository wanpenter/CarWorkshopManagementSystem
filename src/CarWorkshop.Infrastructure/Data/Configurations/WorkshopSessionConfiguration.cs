using CarWorkshop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CarWorkshop.Infrastructure.Data.Configurations;

internal sealed class WorkshopSessionConfiguration : IEntityTypeConfiguration<WorkshopSession>
{
    public void Configure(EntityTypeBuilder<WorkshopSession> builder)
    {
        builder.ToTable("WorkshopSessions");
        builder.HasKey(session => session.Id);

        builder.Property(session => session.Id)
            .HasMaxLength(32)
            .IsFixedLength();

        builder.Property(session => session.CreatedAtUtc)
            .HasConversion(
                value => value,
                value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
            .IsRequired();

        builder.Property(session => session.ExpiresAtUtc)
            .HasConversion(
                value => value,
                value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
            .IsRequired();

        builder.Property(session => session.RevokedAtUtc)
            .HasConversion(
                value => value,
                value => value.HasValue
                    ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc)
                    : null);

        builder.HasIndex(session => session.ExpiresAtUtc);
        builder.HasIndex(session => new { session.WorkshopUserId, session.RevokedAtUtc });
    }
}
