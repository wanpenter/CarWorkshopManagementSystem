using CarWorkshop.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CarWorkshop.Infrastructure.Data.Configurations;

internal sealed class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.ToTable("Invoices");
        builder.HasKey(invoice => invoice.Id);
        builder.Property(invoice => invoice.InvoiceNumber)
            .HasMaxLength(Invoice.MaxInvoiceNumberLength)
            .IsRequired();
        builder.Property(invoice => invoice.LabourSubtotal).HasPrecision(10, 2);
        builder.Property(invoice => invoice.PartsSubtotal).HasPrecision(10, 2);
        builder.Property(invoice => invoice.TaxAmount).HasPrecision(10, 2);
        builder.Property(invoice => invoice.TotalAmount).HasPrecision(10, 2);
        builder.Property(invoice => invoice.AmountPaid).HasPrecision(10, 2);
        builder.Ignore(invoice => invoice.BalanceDue);
        builder.Property(invoice => invoice.PaymentStatus)
            .HasConversion<string>()
            .HasMaxLength(20)
            .IsRequired();
        builder.Property(invoice => invoice.PaymentMethod)
            .HasConversion<string>()
            .HasMaxLength(24);
        builder.Property(invoice => invoice.PaymentReference)
            .HasMaxLength(Invoice.MaxPaymentReferenceLength);
        builder.Property(invoice => invoice.IssuedAtUtc)
            .HasConversion(
                value => value,
                value => DateTime.SpecifyKind(value, DateTimeKind.Utc))
            .IsRequired();
        builder.Property(invoice => invoice.PaidAtUtc)
            .HasConversion(
                value => value,
                value => value.HasValue ? DateTime.SpecifyKind(value.Value, DateTimeKind.Utc) : null);
        builder.HasIndex(invoice => invoice.InvoiceNumber).IsUnique();
        builder.HasIndex(invoice => invoice.AppointmentId).IsUnique();
    }
}
