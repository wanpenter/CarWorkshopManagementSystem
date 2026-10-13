using CarWorkshop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CarWorkshop.Infrastructure.Data.Configurations;

internal sealed class AppointmentConfiguration : IEntityTypeConfiguration<Appointment>
{
    public void Configure(EntityTypeBuilder<Appointment> builder)
    {
        builder.ToTable("Appointments");
        builder.HasKey(appointment => appointment.Id);

        builder.Property(appointment => appointment.ScheduledAtUtc)
            .HasConversion(
                value => value,
                value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
            .IsRequired();

        builder.Property(appointment => appointment.EstimatedEndUtc)
            .HasConversion(
                value => value,
                value => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : null);

        builder.HasMany(appointment => appointment.Services)
            .WithOne(item => item.Appointment)
            .HasForeignKey(item => item.AppointmentId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Property(appointment => appointment.ServiceType)
            .HasMaxLength(100)
            .IsRequired();

        builder.Property(appointment => appointment.Notes)
            .HasMaxLength(500);

        builder.Property(appointment => appointment.Status)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();

        builder.Property(appointment => appointment.CreatedAt)
            .HasConversion(
                value => value,
                value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
            .IsRequired();

        builder.HasIndex(appointment => appointment.CustomerId);
        builder.HasIndex(appointment => appointment.VehicleId);
        builder.HasIndex(appointment => new { appointment.Status, appointment.ScheduledAtUtc });

        builder.HasOne(appointment => appointment.Customer)
            .WithMany()
            .HasForeignKey(appointment => appointment.CustomerId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(appointment => appointment.Vehicle)
            .WithMany()
            .HasForeignKey(appointment => appointment.VehicleId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
