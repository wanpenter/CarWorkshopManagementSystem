using Microsoft.EntityFrameworkCore;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Infrastructure.Data;

public class CarWorkshopDbContext : DbContext
{
    public CarWorkshopDbContext(
        DbContextOptions<CarWorkshopDbContext> options)
        : base(options)
    {
    }

    public DbSet<Car> Cars { get; set; }

    public DbSet<Customer> Customers { get; set; }

    public DbSet<Vehicle> Vehicles { get; set; }

    public DbSet<Appointment> Appointments { get; set; }

    public DbSet<Service> Services { get; set; }

    public DbSet<Mechanic> Mechanics { get; set; }

    public DbSet<AppointmentService> AppointmentServices { get; set; }

    public DbSet<WorkshopUser> WorkshopUsers { get; set; }

    public DbSet<WorkshopSession> WorkshopSessions { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CarWorkshopDbContext).Assembly);
    }
}
