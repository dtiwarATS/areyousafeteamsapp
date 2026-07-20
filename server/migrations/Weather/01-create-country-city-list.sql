-- Weather Advisory: create CountryList and CityList (idempotent).
-- Run order: 01 → 02 → 03
-- Skips create when legacy WeatherAlert* tables exist so 02 can rename them.
-- App usage: weather-alert-locations-db.js, seed-weather-alert-cities.js

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'CountryList')
AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'WeatherAlertSupportedCountry')
BEGIN
    CREATE TABLE [dbo].[CountryList] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [CountryName] NVARCHAR(200) NOT NULL,
        [Code] NVARCHAR(10) NOT NULL,
        [Region] NVARCHAR(50) NULL,
        [IsWeatherAlertSupported] BIT NOT NULL CONSTRAINT [DF_CountryList_IsWeatherAlertSupported] DEFAULT (1),
        CONSTRAINT [PK_CountryList] PRIMARY KEY CLUSTERED ([Id])
    );

    CREATE UNIQUE NONCLUSTERED INDEX [UX_CountryList_Code]
        ON [dbo].[CountryList] ([Code]);
END
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'CityList')
AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'WeatherAlertCity')
BEGIN
    CREATE TABLE [dbo].[CityList] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [CountryId] INT NOT NULL,
        [CityName] NVARCHAR(200) NOT NULL,
        [State] NVARCHAR(100) NULL,
        [Latitude] DECIMAL(10,7) NOT NULL,
        [Longitude] DECIMAL(10,7) NOT NULL,
        CONSTRAINT [PK_CityList] PRIMARY KEY CLUSTERED ([Id]),
        CONSTRAINT [FK_CityList_CountryList] FOREIGN KEY ([CountryId])
            REFERENCES [dbo].[CountryList] ([Id]) ON DELETE CASCADE
    );

    CREATE NONCLUSTERED INDEX [IX_CityList_CountryId_CityName]
        ON [dbo].[CityList] ([CountryId], [CityName]);
END
GO
