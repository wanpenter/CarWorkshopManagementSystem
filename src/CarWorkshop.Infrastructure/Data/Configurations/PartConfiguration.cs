using CarWorkshop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CarWorkshop.Infrastructure.Data.Configurations;

internal sealed class PartConfiguration : IEntityTypeConfiguration<Part>
{
    public void Configure(EntityTypeBuilder<Part> builder)
    {
        builder.ToTable("Parts");
        builder.HasKey(part => part.Id);
        builder.Property(part => part.Sku).HasMaxLength(Part.MaxSkuLength).IsRequired();
        builder.Property(part => part.Name).HasMaxLength(Part.MaxNameLength).IsRequired();
        builder.Property(part => part.Description).HasMaxLength(Part.MaxDescriptionLength);
        builder.Property(part => part.UnitPrice).HasPrecision(10, 2);
        builder.Property(part => part.CreatedAtUtc)
            .HasConversion(
                value => value,
                value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
            .IsRequired();
        builder.HasIndex(part => part.Sku).IsUnique();
    }
}
