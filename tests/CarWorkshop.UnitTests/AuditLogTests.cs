using CarWorkshop.Domain.Entities;

namespace CarWorkshop.UnitTests;

public sealed class AuditLogTests
{
    private static readonly DateTime NowUtc = new(2026, 11, 23, 4, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Create_populates_trimmed_values_and_allows_nullable_snapshots()
    {
        var log = AuditLog.Create(
            userId: 5,
            actorUsername: " admin ",
            actorRole: " Admin ",
            action: " Appointment.StatusChanged ",
            entityType: " Appointment ",
            entityId: 12,
            summary: " Changed status from Requested to Confirmed. ",
            oldValuesJson: "{\"status\":\"Requested\"}",
            newValuesJson: "{\"status\":\"Confirmed\"}",
            createdAtUtc: NowUtc);

        Assert.Equal(5, log.UserId);
        Assert.Equal("admin", log.ActorUsername);
        Assert.Equal("Admin", log.ActorRole);
        Assert.Equal("Appointment.StatusChanged", log.Action);
        Assert.Equal("Appointment", log.EntityType);
        Assert.Equal(12, log.EntityId);
        Assert.Equal("Changed status from Requested to Confirmed.", log.Summary);
        Assert.Equal("{\"status\":\"Requested\"}", log.OldValuesJson);
        Assert.Equal("{\"status\":\"Confirmed\"}", log.NewValuesJson);
        Assert.Equal(NowUtc, log.CreatedAtUtc);
    }

    [Fact]
    public void Create_rejects_non_utc_timestamps()
    {
        var localTime = new DateTime(2026, 11, 23, 12, 0, 0, DateTimeKind.Local);

        Assert.Throws<ArgumentException>(() => AuditLog.Create(
            1, "admin", "Admin", "Customer.Created", "Customer", 1, "Created customer.", null, null, localTime));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-4)]
    public void Create_rejects_non_positive_user_or_entity_ids(int invalidId)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => AuditLog.Create(
            invalidId, "admin", "Admin", "Customer.Created", "Customer", 1, "Created customer.", null, null, NowUtc));

        Assert.Throws<ArgumentOutOfRangeException>(() => AuditLog.Create(
            1, "admin", "Admin", "Customer.Created", "Customer", invalidId, "Created customer.", null, null, NowUtc));
    }

    [Fact]
    public void Create_rejects_blank_required_fields_and_excess_summary_length()
    {
        Assert.Throws<ArgumentException>(() => AuditLog.Create(
            null, " ", "System", "Customer.Created", "Customer", 1, "Summary", null, null, NowUtc));

        Assert.Throws<ArgumentException>(() => AuditLog.Create(
            null, "system", "System", "Customer.Created", "Customer", 1, new string('x', AuditLog.MaxSummaryLength + 1), null, null, NowUtc));
    }
}
