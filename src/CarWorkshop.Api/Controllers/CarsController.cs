using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using CarWorkshop.Api.Models;
using CarWorkshop.Api.Services;
using CarWorkshop.Api.Requests;

namespace CarWorkshop.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CarsController : ControllerBase

    {
        private readonly CarService _carService;
        public CarsController(CarService carService)
        {
            _carService = carService;
        }

        [HttpGet]
        public IActionResult GetCars()
        {
            var cars = _carService.GetCars();

            return Ok(cars);
        }

        [HttpGet("{id}")]
        public IActionResult GetCarById(int id)
        {
            var car = _carService.GetCarById(id);

            if (car == null) 
                return NotFound();

            return Ok(car);
        }
        [HttpPost]
        public IActionResult AddCar(CarRequest request)
        {
            var newCar = _carService.AddCar(
                request.Brand,
                request.Model
            );

            return CreatedAtAction(
                nameof(GetCarById),
                new { id = newCar.Id },
                newCar
            );
        }

        [HttpDelete("{id}")]
        public IActionResult DeleteCar(int id)
        {
            var deleted = _carService.DeleteCar(id);

            if (!deleted)
                return NotFound();

            return NoContent();
        }

        [HttpPut("{id}")]
        public IActionResult UpdateCar(int id, [FromBody] CarRequest request)
        {
            var car = _carService.UpdateCar(id, request.Brand, request.Model);

            if (car == null)
                return NotFound();

            return Ok(car);
        }
    }



}