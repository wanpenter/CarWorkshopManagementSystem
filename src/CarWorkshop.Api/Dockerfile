# Stage 1: Build & Publish (SDK)
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Copy .csproj dulu supaya Docker boleh cache NuGet restore (laju bila rebuild!)
COPY src/CarWorkshop.Domain/CarWorkshop.Domain.csproj src/CarWorkshop.Domain/
COPY src/CarWorkshop.Application/CarWorkshop.Application.csproj src/CarWorkshop.Application/
COPY src/CarWorkshop.Infrastructure/CarWorkshop.Infrastructure.csproj src/CarWorkshop.Infrastructure/
COPY src/CarWorkshop.Api/CarWorkshop.Api.csproj src/CarWorkshop.Api/
RUN dotnet restore src/CarWorkshop.Api/CarWorkshop.Api.csproj

# Copy source code backend & publish versi Release
COPY src/CarWorkshop.Domain/ src/CarWorkshop.Domain/
COPY src/CarWorkshop.Application/ src/CarWorkshop.Application/
COPY src/CarWorkshop.Infrastructure/ src/CarWorkshop.Infrastructure/
COPY src/CarWorkshop.Api/ src/CarWorkshop.Api/
RUN dotnet publish src/CarWorkshop.Api/CarWorkshop.Api.csproj -c Release -o /app/publish --no-restore

# Stage 2: Runtime ringan (ASP.NET Core sahaja)
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app

# Sediakan folder persistent Data Protection keys untuk non-root user
RUN mkdir -p /app/keys && chown -R $APP_UID:$APP_UID /app/keys

COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

USER $APP_UID
ENTRYPOINT ["dotnet", "CarWorkshop.Api.dll"]