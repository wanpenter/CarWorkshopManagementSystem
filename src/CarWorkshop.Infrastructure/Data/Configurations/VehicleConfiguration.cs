using CarWorkshop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CarWorkshop.Infrastructure.Data.Configurations;

internal sealed class VehicleConfiguration : IEntityTypeConfiguration<Vehicle>
{
    public void Configure(EntityTypeBuilder<Vehicle> builder)
    {
        builder.ToTable("Vehicles");
        builder.HasKey(vehicle => vehicle.Id);

        builder.Property(vehicle => vehicle.RegistrationNumber)
            .HasMaxLength(20)
            .IsRequired();

        builder.HasIndex(vehicle => vehicle.RegistrationNumber)
            .IsUnique();

        builder.Property(vehicle => vehicle.Make)
            .HasMaxLength(50)
            .IsRequired();

        builder.Property(vehicle => vehicle.Model)
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(vehicle => vehicle.Mileage)
            .HasDefaultValue(0)
            .ValueGeneratedNever()
            .IsRequired();

        builder.Property(vehicle => vehicle.IsActive)
            .HasDefaultValue(true)
            .ValueGeneratedNever()
            .IsRequired();

        builder.Property(vehicle => vehicle.CreatedAt)
            .HasConversion(
                value => value,
                value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
            .IsRequired();
    }
}
