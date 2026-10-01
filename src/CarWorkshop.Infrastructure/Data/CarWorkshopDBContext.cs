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
}