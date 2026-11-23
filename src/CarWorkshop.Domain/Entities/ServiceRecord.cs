namespace CarWorkshop.Domain.Entities;

public sealed class ServiceRecord
{
    public const int MaxWorkLength = 2000;

    private ServiceRecord()
    {
    }

    internal ServiceRecord(int mileage, string workPerformed, DateTime recordedAtUtc, int? nextServiceMileage = null)
    {
        if (mileage < 0)
            throw new ArgumentOutOfRangeException(nameof(mileage), "Mileage must be zero or greater.");
        if (nextServiceMileage.HasValue && nextServiceMileage.Value <= mileage)
            throw new ArgumentOutOfRangeException(nameof(nextServiceMileage), "Next service mileage must be greater than current mileage.");
        if (string.IsNullOrWhiteSpace(workPerformed) || workPerformed.Trim().Length > MaxWorkLength)
            throw new ArgumentException($"Describe the work in 1 to {MaxWorkLength} characters.", nameof(workPerformed));

        Mileage = mileage;
        NextServiceMileage = nextServiceMileage;
        WorkPerformed = workPerformed.Trim();
        RecordedAtUtc = recordedAtUtc;
    }

    public int Mileage { get; private set; }
    public int? NextServiceMileage { get; private set; }
    public string WorkPerformed { get; private set; } = string.Empty;
    public DateTime RecordedAtUtc { get; private set; }
}
