namespace IoTTeamCenter.Api.Infrastructure;

public sealed class BusinessClock(TimeProvider timeProvider, TimeZoneInfo timeZone)
{
    public DateTimeOffset UtcNow => timeProvider.GetUtcNow();

    public DateOnly Today
    {
        get
        {
            var local = TimeZoneInfo.ConvertTime(timeProvider.GetUtcNow(), timeZone);
            return DateOnly.FromDateTime(local.DateTime);
        }
    }
}
