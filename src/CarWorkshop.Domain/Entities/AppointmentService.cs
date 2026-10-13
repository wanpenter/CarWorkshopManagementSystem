namespace CarWorkshop.Domain.Entities;

public sealed class AppointmentService
{
    private AppointmentService() { }

    public AppointmentService(Service service)
    {
        ServiceId = service.Id;
        Service = service;
        Name = service.Name;
        Price = service.CurrentPrice;
        DurationMinutes = service.EstimatedDurationMinutes;
    }

    public int Id { get; private set; }
    public int AppointmentId { get; private set; }
    public Appointment Appointment { get; private set; } = null!;
    public int ServiceId { get; private set; }
    public Service Service { get; private set; } = null!;
    public string Name { get; private set; } = string.Empty;
    public decimal Price { get; private set; }
    public int DurationMinutes { get; private set; }
}
