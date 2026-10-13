using CarWorkshop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CarWorkshop.Infrastructure.Data.Configurations;

internal sealed class ServiceConfiguration : IEntityTypeConfiguration<Service>
{
    public void Configure(EntityTypeBuilder<Service> builder)
    {
        builder.ToTable("Services");
        builder.HasKey(service => service.Id);
        builder.Property(service => service.Name).HasMaxLength(100).IsRequired();
        builder.Property(service => service.Description).HasMaxLength(500);
        builder.Property(service => service.CurrentPrice).HasPrecision(10, 2);
        builder.HasIndex(service => service.Name).IsUnique();
    }
}
