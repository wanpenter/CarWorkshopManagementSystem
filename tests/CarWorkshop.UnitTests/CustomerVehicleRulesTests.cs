using CarWorkshop.Domain.Entities;

namespace CarWorkshop.UnitTests;

public sealed class CustomerVehicleRulesTests
{
    [Theory]
    [InlineData("abc-1234", "ABC1234")]
    [InlineData(" A B\t1-2 ", "AB12")]
    public void Registration_normalizes_equivalent_values(string entered, string expected)
    {
        Assert.Equal(expected, Vehicle.NormalizeRegistrationNumber(entered));
    }

    [Theory]
    [InlineData("AB@123")]
    [InlineData("ÄB123")]
    [InlineData("---")]
    public void Registration_rejects_invalid_values(string entered)
    {
        Assert.Throws<ArgumentException>(() => Vehicle.NormalizeRegistrationNumber(entered));
    }

    [Theory]
    [InlineData("123+4567890")]
    [InlineData("++1234567890")]
    [InlineData("+１２３４５６７８９０")]
    public void Customer_rejects_invalid_phone(string phone)
    {
        Assert.Throws<ArgumentException>(() => Customer.Create("Alex Lee", phone, null, DateTime.UtcNow));
    }

    [Fact]
    public void Vehicle_requires_valid_owner_year_and_mileage()
    {
        var now = DateTime.UtcNow;
        Assert.Throws<ArgumentOutOfRangeException>(() => Vehicle.Create(0, "ABC123", "Honda", "City", 2020, 0, true, now));
        Assert.Throws<ArgumentOutOfRangeException>(() => Vehicle.Create(1, "ABC123", "Honda", "City", 1899, 0, true, now));
        Assert.Throws<ArgumentOutOfRangeException>(() => Vehicle.Create(1, "ABC123", "Honda", "City", 2020, -1, true, now));
    }

    [Fact]
    public void Customer_and_vehicle_keep_utc_creation_time()
    {
        var now = DateTime.UtcNow;
        var customer = Customer.Create(" Alex Lee ", "+60123456789", "  Street  ", now);
        var vehicle = Vehicle.Create(1, "ab-123", " Honda ", " City ", null, 0, false, now);

        Assert.Equal("Alex Lee", customer.FullName);
        Assert.Equal("Street", customer.Address);
        Assert.Equal(DateTimeKind.Utc, customer.CreatedAt.Kind);
        Assert.Equal("AB123", vehicle.RegistrationNumber);
        Assert.False(vehicle.IsActive);
        Assert.Null(vehicle.Year);
        Assert.Equal(DateTimeKind.Utc, vehicle.CreatedAt.Kind);
    }
}
