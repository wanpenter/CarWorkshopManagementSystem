using System.ComponentModel.DataAnnotations;
using CarWorkshop.Domain.Entities;

namespace CarWorkshop.Api.Requests;

public sealed class TransitionAppointmentStatusRequest
{
    [Required(ErrorMessage = "Choose a status.")]
    public string Status { get; init; } = string.Empty;

    [StringLength(Appointment.MaxStatusReasonLength, ErrorMessage = "Reason must be 300 characters or fewer.")]
    public string? Reason { get; init; }
}
