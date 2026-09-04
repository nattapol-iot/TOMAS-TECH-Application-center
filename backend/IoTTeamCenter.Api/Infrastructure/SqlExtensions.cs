using System.Data;
using Microsoft.Data.SqlClient;

namespace IoTTeamCenter.Api.Infrastructure;

public static class SqlExtensions
{
    public static SqlParameter AddParameter(
        this SqlParameterCollection parameters,
        string name,
        SqlDbType type,
        object? value,
        int size = 0,
        byte precision = 0,
        byte scale = 0)
    {
        var parameter = size != 0 ? parameters.Add(name, type, size) : parameters.Add(name, type);
        if (precision > 0) parameter.Precision = precision;
        if (scale > 0) parameter.Scale = scale;
        parameter.Value = value ?? DBNull.Value;
        return parameter;
    }

    public static string RowVersionString(this SqlDataReader reader, int ordinal) =>
        Convert.ToBase64String((byte[])reader.GetValue(ordinal));

    public static byte[] ParseRowVersion(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            throw new ApiException(StatusCodes.Status400BadRequest, "invalid_row_version", "The row version is required.");
        try
        {
            var bytes = Convert.FromBase64String(value);
            if (bytes.Length != 8)
                throw new ApiException(StatusCodes.Status400BadRequest, "invalid_row_version", "The row version must contain exactly 8 bytes.");
            return bytes;
        }
        catch (FormatException exception)
        {
            throw new ApiException(StatusCodes.Status400BadRequest, "invalid_row_version", "The row version is invalid.", exception.Message);
        }
    }
}
