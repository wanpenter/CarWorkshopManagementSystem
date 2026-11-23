namespace CarWorkshop.Application.Interfaces;

public sealed record CurrentActor(int? UserId, string Username, string Role)
{
    public static CurrentActor System { get; } = new(null, "system", "System");
}

public interface ICurrentUserContext
{
    CurrentActor GetCurrentActor();
}
