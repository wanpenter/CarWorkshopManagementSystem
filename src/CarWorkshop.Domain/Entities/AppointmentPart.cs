namespace CarWorkshop.Domain.Entities;

public sealed class AppointmentPart
{
    private AppointmentPart() { }

    internal AppointmentPart(Part part, int quantity)
    {
        ArgumentNullException.ThrowIfNull(part);
        if (!part.IsActive)
            throw new InvalidOperationException($"Part {part.Name} ({part.Sku}) is inactive and cannot be added.");
        if (quantity < 1 || quantity > 1000)
            throw new ArgumentOutOfRangeException(nameof(quantity), "Quantity must be between 1 and 1,000.");

        PartId = part.Id;
        Part = part;
        Sku = part.Sku;
        Name = part.Name;
        UnitPrice = part.UnitPrice;
        Quantity = quantity;
    }

    public int Id { get; private set; }
    public int AppointmentId { get; private set; }
    public Appointment Appointment { get; private set; } = null!;
    public int PartId { get; private set; }
    public Part Part { get; private set; } = null!;
    public string Sku { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public decimal UnitPrice { get; private set; }
    public int Quantity { get; private set; }

    public decimal LineTotal => UnitPrice * Quantity;
}
