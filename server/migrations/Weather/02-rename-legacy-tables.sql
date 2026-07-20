-- Weather Advisory: rename legacy table names to CountryList / CityList.
-- No-op when CountryList / CityList already exist.

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'WeatherAlertSupportedCountry'
)
AND NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'CountryList'
)
BEGIN
    EXEC sp_rename 'dbo.WeatherAlertSupportedCountry', 'CountryList';
END
GO

IF EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'WeatherAlertCity'
)
AND NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'CityList'
)
BEGIN
    EXEC sp_rename 'dbo.WeatherAlertCity', 'CityList';
END
GO
