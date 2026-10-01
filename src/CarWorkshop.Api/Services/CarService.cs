using CarWorkshop.Domain.Entities;
using CarWorkshop.Infrastructure.Data;

namespace CarWorkshop.Api.Services
{
    public class CarService
    {
        private readonly CarWorkshopDbContext _context;

        public CarService(CarWorkshopDbContext context)
        {
            _context = context;
        }

        public List<Car> GetCars()
        {
            return _context.Cars.ToList();
        }

        public Car? GetCarById(int id)
        {
            return _context.Cars.Find(id);
        }

        public Car AddCar(string brand, string model)
        {
            var newCar = new Car
            {
                Brand = brand,
                Model = model
            };

            _context.Cars.Add(newCar);
            _context.SaveChanges();

            return newCar;
        }

        public bool DeleteCar(int id)
        {
            var car = _context.Cars.Find(id);

            if (car == null)
                return false;

            _context.Cars.Remove(car);
            _context.SaveChanges();

            return true;
        }

        public Car? UpdateCar(int id, string brand, string model)
        {
            var car = _context.Cars.Find(id);

            if (car == null)
                return null;

            car.Brand = brand;
            car.Model = model;

            _context.SaveChanges();

            return car;
        }
    }
}