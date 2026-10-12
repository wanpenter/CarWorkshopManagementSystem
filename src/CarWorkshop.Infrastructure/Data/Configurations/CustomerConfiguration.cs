using CarWorkshop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CarWorkshop.Infrastructure.Data.Configurations;

internal sealed class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        builder.ToTable("Customers");
        builder.HasKey(customer => customer.Id);

        builder.Property(customer => customer.FullName)
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(customer => customer.Phone)
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(customer => customer.Address)
            .HasMaxLength(500);

        builder.Property(customer => customer.CreatedAt)
            .HasConversion(
                value => value,
                value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
            .IsRequired();

        builder.HasMany(customer => customer.Vehicles)
            .WithOne(vehicle => vehicle.Customer)
            .HasForeignKey(vehicle => vehicle.CustomerId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
