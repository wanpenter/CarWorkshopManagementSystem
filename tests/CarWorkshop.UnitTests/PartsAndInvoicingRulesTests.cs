using CarWorkshop.Domain.Entities;

namespace CarWorkshop.UnitTests;

public sealed class PartsAndInvoicingRulesTests
{
    private static readonly DateTime NowUtc = new(2026, 10, 13, 1, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime StartUtc = NowUtc.AddDays(1);

    [Fact]
    public void Part_normalizes_sku_tracks_low_stock_and_guards_stock_bounds()
    {
        var part = new Part("  of-5w30_01 ", "Synthetic Oil 5W-30", "4L bottle", 145.50m, 6, 5, true, NowUtc);

        Assert.Equal("OF-5W30_01", part.Sku);
        Assert.False(part.IsLowStock);

        part.AdjustStock(-1);
        Assert.Equal(5, part.StockQuantity);
        Assert.True(part.IsLowStock);

        Assert.Throws<ArgumentException>(() => part.AdjustStock(0));
        Assert.Throws<InvalidOperationException>(() => part.AdjustStock(-6));
        Assert.Throws<ArgumentException>(() => new Part("BAD SKU!", "Invalid", null, 10m, 1, 1, true, NowUtc));
    }

    [Fact]
    public void Appointment_part_usage_requires_in_progress_or_completed_deducts_and_restores_stock()
    {
        var service = new Service("Minor Service", null, 120m, 60);
        var booking = Appointment.CreateBooking(1, 2, StartUtc, [service], null, NowUtc);
        var part = CreateSavedPart(id: 10, sku: "FLT-01", name: "Oil Filter", unitPrice: 35m, stock: 4);

        Assert.Throws<InvalidOperationException>(() => booking.AddPartUsage(part, 1));

        booking.TransitionStatus(AppointmentStatus.Confirmed, null, NowUtc);
        booking.AssignMechanic(CreateSavedMechanic());
        booking.TransitionStatus(AppointmentStatus.InProgress, null, StartUtc);

        var line = booking.AddPartUsage(part, 2);
        typeof(AppointmentPart).GetProperty(nameof(AppointmentPart.Id))!.SetValue(line, 101);

        Assert.Equal(2, part.StockQuantity);
        Assert.Equal(70m, line.LineTotal);

        // Changing part catalogue price later does not alter the recorded line snapshot.
        part.Update("FLT-01", "Oil Filter V2", null, 50m, 2, true);
        Assert.Equal(35m, line.UnitPrice);
        Assert.Equal("Oil Filter", line.Name);

        // Over-deducting beyond remaining stock fails cleanly without mutating stock.
        Assert.Throws<InvalidOperationException>(() => booking.AddPartUsage(part, 3));
        Assert.Equal(2, part.StockQuantity);

        booking.RemovePartUsage(101, part);
        Assert.Empty(booking.PartsUsed);
        Assert.Equal(4, part.StockQuantity);
    }

    [Fact]
    public void Invoice_computes_totals_tracks_partial_and_full_payments_and_locks_parts_after_payment()
    {
        var service = new Service("Brake Overhaul", null, 180m, 90);
        var booking = Appointment.CreateBooking(1, 2, StartUtc, [service], null, NowUtc);
        typeof(Appointment).GetProperty(nameof(Appointment.Id))!.SetValue(booking, 42);
        var part = CreateSavedPart(id: 11, sku: "BRK-PAD", name: "Front Brake Pad", unitPrice: 95m, stock: 5);

        booking.TransitionStatus(AppointmentStatus.Confirmed, null, NowUtc);
        booking.AssignMechanic(CreateSavedMechanic());
        booking.TransitionStatus(AppointmentStatus.InProgress, null, StartUtc);
        booking.AddPartUsage(part, 2); // RM 190
        booking.TransitionStatus(AppointmentStatus.Completed, null, StartUtc.AddHours(2));

        var invoice = booking.EnsureInvoiceIssued("INV-2026-00042", StartUtc.AddHours(2));
        Assert.Equal("INV-2026-00042", invoice.InvoiceNumber);
        Assert.Equal(180m, invoice.LabourSubtotal);
        Assert.Equal(190m, invoice.PartsSubtotal);
        Assert.Equal(370m, invoice.TotalAmount);
        Assert.Equal(370m, invoice.BalanceDue);
        Assert.Equal(PaymentStatus.Unpaid, invoice.PaymentStatus);

        // Partial payment
        invoice.RecordPayment(150m, PaymentMethod.DuitNowQR, "DN-8891", StartUtc.AddHours(3));
        Assert.Equal(150m, invoice.AmountPaid);
        Assert.Equal(220m, invoice.BalanceDue);
        Assert.Equal(PaymentStatus.PartiallyPaid, invoice.PaymentStatus);
        Assert.Equal(PaymentMethod.DuitNowQR, invoice.PaymentMethod);
        Assert.Equal("DN-8891", invoice.PaymentReference);
        Assert.Null(invoice.PaidAtUtc);

        // Once any payment is recorded, parts cannot be changed.
        Assert.Throws<InvalidOperationException>(() => booking.AddPartUsage(part, 1));

        // Overpayment rejected.
        Assert.Throws<InvalidOperationException>(() =>
            invoice.RecordPayment(220.01m, PaymentMethod.Cash, null, StartUtc.AddHours(4)));

        // Final payment settles invoice.
        var paidAt = StartUtc.AddHours(4);
        invoice.RecordPayment(220m, PaymentMethod.Cash, null, paidAt);
        Assert.Equal(370m, invoice.AmountPaid);
        Assert.Equal(0m, invoice.BalanceDue);
        Assert.Equal(PaymentStatus.Paid, invoice.PaymentStatus);
        Assert.Equal(paidAt, invoice.PaidAtUtc);

        // Paying an already paid invoice fails.
        Assert.Throws<InvalidOperationException>(() =>
            invoice.RecordPayment(1m, PaymentMethod.Card, null, paidAt.AddMinutes(5)));
    }

    private static Part CreateSavedPart(int id, string sku, string name, decimal unitPrice, int stock)
    {
        var part = new Part(sku, name, null, unitPrice, stock, 2, true, NowUtc);
        typeof(Part).GetProperty(nameof(Part.Id))!.SetValue(part, id);
        return part;
    }

    private static Mechanic CreateSavedMechanic(int id = 1)
    {
        var mechanic = Mechanic.Create("Test Mechanic", "0123456789", NowUtc);
        typeof(Mechanic).GetProperty(nameof(Mechanic.Id))!.SetValue(mechanic, id);
        return mechanic;
    }
}
