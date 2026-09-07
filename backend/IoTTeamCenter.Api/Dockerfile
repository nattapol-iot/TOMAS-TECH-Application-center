FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY IoTTeamCenter.Api.csproj .
RUN dotnet restore IoTTeamCenter.Api.csproj
COPY . .
RUN dotnet publish IoTTeamCenter.Api.csproj -c Release --no-self-contained -o /app

# Standard (non-alpine, non-chiseled) tag: InvariantGlobalization=false needs ICU, and
# Authentication__RequiredScope aside, Business__TimeZoneId uses a Windows zone id
# ("SE Asia Standard Time") that .NET resolves via ICU's zone-mapping data on Linux too.
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
ENTRYPOINT ["dotnet", "IoTTeamCenter.Api.dll"]
