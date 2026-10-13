using CarWorkshop.Domain.Entities;

namespace CarWorkshop.UnitTests;

public sealed class AppointmentRulesTests
{
    private static readonly DateTime NowUtc = new(2026, 10, 13, 1, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void Create_normalizes_content_and_starts_scheduled()
    {
        var appointment = Appointment.Create(
            10,
            20,
            NowUtc.AddDays(1),
            "  Oil change  ",
            "  Use synthetic oil  ",
            NowUtc,
            NowUtc);

        Assert.Equal(AppointmentStatus.Scheduled, appointment.Status);
        Assert.Equal("Oil change", appointment.ServiceType);
        Assert.Equal("Use synthetic oil", appointment.Notes);
        Assert.Equal(DateTimeKind.Utc, appointment.ScheduledAtUtc.Kind);
        Assert.Equal(DateTimeKind.Utc, appointment.CreatedAt.Kind);
    }

    [Theory]
    [InlineData(0, 1)]
    [InlineData(1, 0)]
    public void Create_requires_customer_and_vehicle(int customerId, int vehicleId)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => Appointment.Create(
            customerId,
            vehicleId,
            NowUtc.AddHours(1),
            "Inspection",
            null,
            NowUtc,
            NowUtc));
    }

    [Fact]
    public void Create_requires_a_future_utc_schedule()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => Appointment.Create(
            1,
            2,
            NowUtc,
            "Inspection",
            null,
            NowUtc,
            NowUtc));

        Assert.Throws<ArgumentException>(() => Appointment.Create(
            1,
            2,
            DateTime.SpecifyKind(NowUtc.AddHours(1), DateTimeKind.Unspecified),
            "Inspection",
            null,
            NowUtc,
            NowUtc));
    }

    [Fact]
    public void Scheduled_can_start_or_cancel_but_cannot_complete_directly()
    {
        var appointment = CreateAppointment();

        Assert.Throws<InvalidOperationException>(() => appointment.Update(
            1,
            2,
            appointment.ScheduledAtUtc,
            appointment.ServiceType,
            appointment.Notes,
            AppointmentStatus.Completed,
            NowUtc));

        appointment.Update(
            1,
            2,
            appointment.ScheduledAtUtc,
            appointment.ServiceType,
            appointment.Notes,
            AppointmentStatus.InProgress,
            NowUtc);

        Assert.Equal(AppointmentStatus.InProgress, appointment.Status);
    }

    [Fact]
    public void Scheduled_edit_requires_a_future_time()
    {
        var appointment = CreateAppointment();

        Assert.Throws<ArgumentOutOfRangeException>(() => appointment.Update(
            1,
            2,
            NowUtc.AddMinutes(-1),
            "Inspection",
            null,
            AppointmentStatus.Scheduled,
            NowUtc));
    }

    [Fact]
    public void Completed_and_cancelled_appointments_are_immutable()
    {
        var completed = CreateAppointment();
        completed.Update(
            1,
            2,
            completed.ScheduledAtUtc,
            completed.ServiceType,
            completed.Notes,
            AppointmentStatus.InProgress,
            NowUtc);
        completed.Update(
            1,
            2,
            completed.ScheduledAtUtc,
            completed.ServiceType,
            completed.Notes,
            AppointmentStatus.Completed,
            NowUtc);

        Assert.Throws<InvalidOperationException>(() => completed.Update(
            1,
            2,
            completed.ScheduledAtUtc,
            "Different service",
            completed.Notes,
            AppointmentStatus.Completed,
            NowUtc));

        var cancelled = CreateAppointment();
        cancelled.Update(
            1,
            2,
            cancelled.ScheduledAtUtc,
            cancelled.ServiceType,
            cancelled.Notes,
            AppointmentStatus.Cancelled,
            NowUtc);

        Assert.Throws<InvalidOperationException>(() => cancelled.Update(
            1,
            2,
            cancelled.ScheduledAtUtc,
            cancelled.ServiceType,
            cancelled.Notes,
            AppointmentStatus.Scheduled,
            NowUtc));
    }

    private static Appointment CreateAppointment()
    {
        return Appointment.Create(
            1,
            2,
            NowUtc.AddDays(1),
            "Inspection",
            null,
            NowUtc,
            NowUtc);
    }
}
