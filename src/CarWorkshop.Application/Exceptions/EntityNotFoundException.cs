namespace CarWorkshop.Application.Exceptions;

public sealed class EntityNotFoundException : Exception
{
    public EntityNotFoundException(string entityName, int id)
        : base($"{entityName} with id {id} was not found.")
    {
    }
}
