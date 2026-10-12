namespace CarWorkshop.Application.Exceptions;

public sealed class DuplicateRegistrationException : ConflictException
{
    public DuplicateRegistrationException()
        : base("A vehicle with this registration number already exists.")
    {
    }
}
