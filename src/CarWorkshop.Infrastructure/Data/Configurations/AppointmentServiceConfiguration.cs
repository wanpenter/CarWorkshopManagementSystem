using CarWorkshop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CarWorkshop.Infrastructure.Data.Configurations;

internal sealed class AppointmentServiceConfiguration : IEntityTypeConfiguration<AppointmentService>
{
    public void Configure(EntityTypeBuilder<AppointmentService> builder)
    {
        builder.ToTable("AppointmentServices");
        builder.HasKey(item => item.Id);
        builder.Property(item => item.Name).HasMaxLength(100).IsRequired();
        builder.Property(item => item.Price).HasPrecision(10, 2);
        builder.HasIndex(item => new { item.AppointmentId, item.ServiceId }).IsUnique();
        builder.HasOne(item => item.Service).WithMany().HasForeignKey(item => item.ServiceId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
