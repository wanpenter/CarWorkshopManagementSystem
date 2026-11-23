using CarWorkshop.Domain.Entities;

namespace CarWorkshop.UnitTests;

public sealed class ServiceBookingRulesTests
{
    private static readonly DateTime NowUtc = new(2026, 10, 13, 1, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime StartUtc = NowUtc.AddDays(1);

    [Fact]
    public void Booking_starts_requested_and_snapshots_selected_service()
    {
        var service = new Service("Oil change", null, 120m, 90);
        var booking = Appointment.CreateBooking(1, 2, StartUtc, [service], null, NowUtc);

        Assert.Equal(AppointmentStatus.Requested, booking.Status);
        Assert.Equal(StartUtc.AddMinutes(90), booking.EstimatedEndUtc);
        Assert.Collection(booking.Services, snapshot =>
        {
            Assert.Equal("Oil change", snapshot.Name);
            Assert.Equal(120m, snapshot.Price);
            Assert.Equal(90, snapshot.DurationMinutes);
        });
    }

    [Fact]
    public void Review_keeps_original_snapshot_after_catalogue_change_or_deactivation()
    {
        var service = new Service("Inspection", null, 80m, 60);
        var booking = Appointment.CreateBooking(1, 2, StartUtc, [service], null, NowUtc);
        service.Update("Inspection plus", null, 140m, 120, false);

        booking.UpdateBooking(1, 2, StartUtc, [service], null, AppointmentStatus.Confirmed, NowUtc);

        var snapshot = Assert.Single(booking.Services);
        Assert.Equal("Inspection", snapshot.Name);
        Assert.Equal(80m, snapshot.Price);
        Assert.Equal(60, snapshot.DurationMinutes);
        Assert.Equal(StartUtc.AddMinutes(60), booking.EstimatedEndUtc);
    }

    [Fact]
    public void Requested_booking_requires_review_before_work_starts()
    {
        var service = new Service("Inspection", null, 80m, 60);
        var booking = Appointment.CreateBooking(1, 2, StartUtc, [service], null, NowUtc);

        Assert.Throws<InvalidOperationException>(() =>
        
        booking.UpdateBooking( 1, 2, StartUtc, [service], null, AppointmentStatus.InProgress, NowUtc));
        booking.UpdateBooking(1, 2, StartUtc, [service], null, AppointmentStatus.Confirmed, NowUtc);
        booking.UpdateBooking(1, 2, StartUtc, [service], null, AppointmentStatus.InProgress, StartUtc);
        booking.UpdateBooking(1, 2, StartUtc, [service], null, AppointmentStatus.Completed, StartUtc.AddHours(2));

        Assert.Equal(AppointmentStatus.Completed, booking.Status);
    }

    [Fact]
    public void Rescheduling_keeps_snapshot_and_moves_estimated_end()
    {
        var service = new Service("Alignment", null, 95m, 90);
        var booking = Appointment.CreateBooking(1, 2, StartUtc, [service], null, NowUtc);
        service.Update("Alignment", null, 120m, 120, true);

        booking.UpdateBooking(1, 2, StartUtc.AddHours(2), [service], null,
            AppointmentStatus.Requested, NowUtc);

        Assert.Equal(StartUtc.AddHours(3.5), booking.EstimatedEndUtc);
        var snapshot = Assert.Single(booking.Services);
        Assert.Equal(95m, snapshot.Price);
        Assert.Equal(90, snapshot.DurationMinutes);
    }

    [Fact]
    public void TransitionStatus_follows_workflow_and_stores_trimmed_reason()
    {
        var service = new Service("Brake check", null, 75m, 60);
        var booking = Appointment.CreateBooking(1, 2, StartUtc, [service], null, NowUtc);

        Assert.Throws<InvalidOperationException>(() =>
            booking.TransitionStatus(AppointmentStatus.Completed, null, NowUtc));
        Assert.Throws<InvalidOperationException>(() =>
            booking.TransitionStatus(AppointmentStatus.Requested, null, NowUtc));

        booking.TransitionStatus(AppointmentStatus.Confirmed, null, NowUtc);
        Assert.Equal(AppointmentStatus.Confirmed, booking.Status);

        booking.TransitionStatus(AppointmentStatus.Cancelled, "  Customer rescheduled  ", NowUtc);
        Assert.Equal(AppointmentStatus.Cancelled, booking.Status);
        Assert.Equal("Customer rescheduled", booking.StatusReason);

        Assert.Throws<InvalidOperationException>(() =>
            booking.TransitionStatus(AppointmentStatus.Confirmed, null, NowUtc));
    }

    [Fact]
    public void TransitionStatus_rejects_overlong_reason()
    {
        var service = new Service("Brake check", null, 75m, 60);
        var booking = Appointment.CreateBooking(1, 2, StartUtc, [service], null, NowUtc);

        Assert.Throws<ArgumentException>(() =>
            booking.TransitionStatus(AppointmentStatus.Rejected, new string('r', Appointment.MaxStatusReasonLength + 1), NowUtc));
    }

    [Fact]
    public void ServiceRecord_requires_next_service_mileage_above_current_mileage()
    {
        var service = new Service("Oil change", null, 120m, 60);
        var booking = Appointment.CreateBooking(1, 2, StartUtc, [service], null, NowUtc);
        booking.TransitionStatus(AppointmentStatus.Confirmed, null, NowUtc);
        booking.TransitionStatus(AppointmentStatus.InProgress, null, StartUtc);
        booking.TransitionStatus(AppointmentStatus.Completed, null, StartUtc.AddHours(1));

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            booking.RecordService(60000, "Oil change", StartUtc.AddHours(1), nextServiceMileage: 60000));
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            booking.RecordService(60000, "Oil change", StartUtc.AddHours(1), nextServiceMileage: 55000));

        booking.RecordService(60000, "Oil change", StartUtc.AddHours(1), nextServiceMileage: 70000);
        Assert.Equal(70000, booking.ServiceRecord!.NextServiceMileage);
    }

    [Fact]
    public void Vehicle_RecordOdometerReading_only_advances_forward()
    {
        var vehicle = Vehicle.Create(1, "JUP9381", "Honda", "City", 2022, 50000, true, NowUtc);

        Assert.False(vehicle.RecordOdometerReading(42000));
        Assert.Equal(50000, vehicle.Mileage);

        Assert.False(vehicle.RecordOdometerReading(50000));
        Assert.Equal(50000, vehicle.Mileage);

        Assert.True(vehicle.RecordOdometerReading(64200));
        Assert.Equal(64200, vehicle.Mileage);
    }
}
