namespace CarWorkshop.Domain.Entities;

public sealed class Invoice
{
    public const int MaxInvoiceNumberLength = 40;
    public const int MaxPaymentReferenceLength = 100;

    private Invoice() { }

    private Invoice(
        int appointmentId,
        string invoiceNumber,
        decimal labourSubtotal,
        decimal partsSubtotal,
        decimal taxAmount,
        DateTime issuedAtUtc)
    {
        if (string.IsNullOrWhiteSpace(invoiceNumber) || invoiceNumber.Trim().Length > MaxInvoiceNumberLength)
            throw new ArgumentException("Invoice number is invalid.", nameof(invoiceNumber));
        if (issuedAtUtc.Kind != DateTimeKind.Utc)
            throw new ArgumentException("Time must be UTC.", nameof(issuedAtUtc));
        if (labourSubtotal < 0m || partsSubtotal < 0m || taxAmount < 0m)
            throw new ArgumentOutOfRangeException(nameof(labourSubtotal), "Invoice totals cannot be negative.");

        AppointmentId = appointmentId;
        InvoiceNumber = invoiceNumber.Trim();
        LabourSubtotal = decimal.Round(labourSubtotal, 2, MidpointRounding.AwayFromZero);
        PartsSubtotal = decimal.Round(partsSubtotal, 2, MidpointRounding.AwayFromZero);
        TaxAmount = decimal.Round(taxAmount, 2, MidpointRounding.AwayFromZero);
        TotalAmount = LabourSubtotal + PartsSubtotal + TaxAmount;
        AmountPaid = 0m;
        IssuedAtUtc = issuedAtUtc;
        PaymentStatus = TotalAmount == 0m ? PaymentStatus.Paid : PaymentStatus.Unpaid;
        PaidAtUtc = TotalAmount == 0m ? issuedAtUtc : null;
    }

    public int Id { get; private set; }
    public int AppointmentId { get; private set; }
    public Appointment Appointment { get; private set; } = null!;
    public string InvoiceNumber { get; private set; } = string.Empty;
    public decimal LabourSubtotal { get; private set; }
    public decimal PartsSubtotal { get; private set; }
    public decimal TaxAmount { get; private set; }
    public decimal TotalAmount { get; private set; }
    public decimal AmountPaid { get; private set; }
    public PaymentStatus PaymentStatus { get; private set; }
    public PaymentMethod? PaymentMethod { get; private set; }
    public string? PaymentReference { get; private set; }
    public DateTime IssuedAtUtc { get; private set; }
    public DateTime? PaidAtUtc { get; private set; }

    public decimal BalanceDue => Math.Max(0m, TotalAmount - AmountPaid);

    public static Invoice IssueFor(Appointment appointment, string invoiceNumber, DateTime issuedAtUtc)
    {
        ArgumentNullException.ThrowIfNull(appointment);
        if (appointment.Status != AppointmentStatus.Completed)
            throw new InvalidOperationException("Invoices can only be issued for completed appointments.");

        var labour = appointment.Services.Sum(service => service.Price);
        var parts = appointment.PartsUsed.Sum(part => part.LineTotal);
        return new Invoice(appointment.Id, invoiceNumber, labour, parts, 0m, issuedAtUtc);
    }

    public void RecalculateTotals(decimal labourSubtotal, decimal partsSubtotal)
    {
        if (AmountPaid > 0m || PaymentStatus == PaymentStatus.Voided)
            throw new InvalidOperationException("Invoice totals cannot be changed after payment has been recorded.");
        if (labourSubtotal < 0m || partsSubtotal < 0m)
            throw new ArgumentOutOfRangeException(nameof(labourSubtotal), "Invoice totals cannot be negative.");

        LabourSubtotal = decimal.Round(labourSubtotal, 2, MidpointRounding.AwayFromZero);
        PartsSubtotal = decimal.Round(partsSubtotal, 2, MidpointRounding.AwayFromZero);
        TotalAmount = LabourSubtotal + PartsSubtotal + TaxAmount;
        PaymentStatus = TotalAmount == 0m ? PaymentStatus.Paid : PaymentStatus.Unpaid;
        PaidAtUtc = TotalAmount == 0m ? IssuedAtUtc : null;
    }

    public void RecordPayment(decimal amount, PaymentMethod method, string? reference, DateTime paidAtUtc)
    {
        if (PaymentStatus == PaymentStatus.Voided)
            throw new InvalidOperationException("Cannot record payment on a voided invoice.");
        if (PaymentStatus == PaymentStatus.Paid && BalanceDue <= 0m)
            throw new InvalidOperationException("This invoice is already paid in full.");
        if (paidAtUtc.Kind != DateTimeKind.Utc)
            throw new ArgumentException("Time must be UTC.", nameof(paidAtUtc));

        var rounded = decimal.Round(amount, 2, MidpointRounding.AwayFromZero);
        if (rounded <= 0m)
            throw new ArgumentOutOfRangeException(nameof(amount), "Payment amount must be greater than zero.");
        if (rounded > BalanceDue)
            throw new InvalidOperationException($"Payment exceeds the remaining balance of RM {BalanceDue:N2}.");

        var trimmedReference = string.IsNullOrWhiteSpace(reference) ? null : reference.Trim();
        if (trimmedReference?.Length > MaxPaymentReferenceLength)
            throw new ArgumentException($"Payment reference cannot exceed {MaxPaymentReferenceLength} characters.", nameof(reference));

        AmountPaid = decimal.Round(AmountPaid + rounded, 2, MidpointRounding.AwayFromZero);
        PaymentMethod = method;
        PaymentReference = trimmedReference ?? PaymentReference;
        if (AmountPaid >= TotalAmount)
        {
            PaymentStatus = PaymentStatus.Paid;
            PaidAtUtc = paidAtUtc;
        }
        else
        {
            PaymentStatus = PaymentStatus.PartiallyPaid;
        }
    }
}
