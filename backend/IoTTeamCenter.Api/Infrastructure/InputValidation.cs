namespace IoTTeamCenter.Api.Infrastructure;

public static class InputValidation
{
    public static void RequiredText(string? value, int maxLength, string field)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw Invalid($"{field} is required.");
        if (value.Trim().Length > maxLength)
            throw Invalid($"{field} must not exceed {maxLength} characters.");
    }

    public static void OptionalText(string? value, int maxLength, string field)
    {
        if (value is not null && value.Trim().Length > maxLength)
            throw Invalid($"{field} must not exceed {maxLength} characters.");
    }

    public static void OneOf(string? value, string field, params string[] allowed)
    {
        RequiredText(value, allowed.Max(item => item.Length), field);
        if (!allowed.Contains(value!.Trim(), StringComparer.Ordinal))
            throw Invalid($"{field} is not an allowed value.");
    }

    public static void DecimalRange(decimal value, decimal minimum, decimal maximum, string field)
    {
        if (value < minimum || value > maximum)
            throw Invalid($"{field} must be between {minimum} and {maximum}.");
    }

    public static void DecimalScale(decimal value, int scale, string field)
    {
        if (decimal.Round(value, scale) != value)
            throw Invalid($"{field} cannot have more than {scale} decimal places.");
    }

    private static ApiException Invalid(string message) =>
        new(StatusCodes.Status400BadRequest, "validation_failed", message);
}
