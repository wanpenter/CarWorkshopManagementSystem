using CarWorkshop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CarWorkshop.Infrastructure.Data.Configurations;

internal sealed class AppointmentPartConfiguration : IEntityTypeConfiguration<AppointmentPart>
{
    public void Configure(EntityTypeBuilder<AppointmentPart> builder)
    {
        builder.ToTable("AppointmentParts");
        builder.HasKey(item => item.Id);
        builder.Property(item => item.Sku).HasMaxLength(Part.MaxSkuLength).IsRequired();
        builder.Property(item => item.Name).HasMaxLength(Part.MaxNameLength).IsRequired();
        builder.Property(item => item.UnitPrice).HasPrecision(10, 2);
        builder.Ignore(item => item.LineTotal);
        builder.HasIndex(item => item.AppointmentId);
        builder.HasIndex(item => item.PartId);
        builder.HasOne(item => item.Part)
            .WithMany()
            .HasForeignKey(item => item.PartId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
