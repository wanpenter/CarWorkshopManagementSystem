using CarWorkshop.Domain.Entities;

namespace CarWorkshop.UnitTests;

public sealed class CustomerPortalRulesTests
{
    private static readonly DateTime NowUtc = new(2026, 11, 23, 8, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void CreateCustomer_creates_active_customer_account_with_customer_link()
    {
        var user = WorkshopUser.CreateCustomer("ali.driver", "Ali Bin Ahmad", 42, "hashed-pw", NowUtc);

        Assert.Equal(WorkshopUser.CustomerRole, user.Role);
        Assert.Equal(42, user.CustomerId);
        Assert.Equal("ALI.DRIVER", user.NormalizedUsername);
        Assert.True(user.IsActive);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public void CreateCustomer_rejects_invalid_customer_id(int invalidCustomerId)
    {
        Assert.Throws<ArgumentException>(() =>
            WorkshopUser.CreateCustomer("ali.driver", "Ali Bin Ahmad", invalidCustomerId, "hashed-pw", NowUtc));
    }

    [Fact]
    public void Create_rejects_customer_role_without_customer_link()
    {
        Assert.Throws<ArgumentException>(() =>
            WorkshopUser.Create("ali.driver", "Ali Bin Ahmad", WorkshopUser.CustomerRole, "hashed-pw", NowUtc));
    }

    [Fact]
    public void UpdateAccess_preserves_customer_and_staff_role_boundary()
    {
        var customerUser = WorkshopUser.CreateCustomer("ali.driver", "Ali Bin Ahmad", 42, "hashed-pw", NowUtc);
        var staffUser = WorkshopUser.Create("siti.staff", "Siti", WorkshopUser.StaffRole, "hashed-pw", NowUtc);

        Assert.Throws<ArgumentException>(() =>
            customerUser.UpdateAccess("Ali Bin Ahmad", WorkshopUser.StaffRole, true));
        Assert.Throws<ArgumentException>(() =>
            customerUser.UpdateAccess("Ali Bin Ahmad", WorkshopUser.AdminRole, true));
        Assert.Throws<ArgumentException>(() =>
            staffUser.UpdateAccess("Siti", WorkshopUser.CustomerRole, true));

        customerUser.UpdateAccess("Ali Updated", WorkshopUser.CustomerRole, false);
        Assert.Equal("Ali Updated", customerUser.FullName);
        Assert.False(customerUser.IsActive);

        customerUser.UpdateFullName("Ali Self Updated");
        Assert.Equal("Ali Self Updated", customerUser.FullName);
    }
}
