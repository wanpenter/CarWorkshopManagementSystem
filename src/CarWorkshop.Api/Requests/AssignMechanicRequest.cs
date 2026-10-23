using System.ComponentModel.DataAnnotations;

namespace CarWorkshop.Api.Requests;

public sealed class AssignMechanicRequest
{
    [Range(1, int.MaxValue)]
    public int MechanicId { get; init; }
}
