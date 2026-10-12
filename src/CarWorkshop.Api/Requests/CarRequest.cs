using System.ComponentModel.DataAnnotations;

namespace CarWorkshop.Api.Requests
{
    public class CarRequest
    {
        [Required(ErrorMessage = "Brand is required.")]
        [StringLength(50, ErrorMessage = "Brand cannot exceed 50 characters.")]
        public string Brand { get; set; } = string.Empty;

        [Required(ErrorMessage = "Model is required.")]
        [StringLength(100, ErrorMessage = "Model cannot exceed 100 characters.")]
        public string Model { get; set; } = string.Empty;
    }
}