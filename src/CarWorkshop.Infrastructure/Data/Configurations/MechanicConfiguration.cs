using CarWorkshop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CarWorkshop.Infrastructure.Data.Configurations;

internal sealed class MechanicConfiguration : IEntityTypeConfiguration<Mechanic>
{
    public void Configure(EntityTypeBuilder<Mechanic> builder)
    {
        builder.ToTable("Mechanics");

        builder.HasKey(mechanic => mechanic.Id);

        builder.Property(mechanic => mechanic.FullName)
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(mechanic => mechanic.Phone)
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(mechanic => mechanic.IsActive)
            .IsRequired();

        builder.Property(mechanic => mechanic.CreatedAt)
            .HasConversion(
                value => value,
                value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
            .IsRequired();
    }
}