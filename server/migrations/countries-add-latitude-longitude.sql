-- Migration: Add latitude and longitude columns to Countries table
-- Populates approximate country-center coordinates for all country codes.
-- Run manually: sqlcmd -S your_server -d your_database -i server/migrations/countries-add-latitude-longitude.sql
-- No changes to application code; new columns are additive (SELECT * will include them).

-- Step 1: Add latitude column
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Countries' AND COLUMN_NAME = 'latitude')
BEGIN
    ALTER TABLE [dbo].[Countries] ADD latitude DECIMAL(10,7) NULL;
END
GO

-- Step 2: Add longitude column
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Countries' AND COLUMN_NAME = 'longitude')
BEGIN
    ALTER TABLE [dbo].[Countries] ADD longitude DECIMAL(10,7) NULL;
END
GO

-- Step 3: Populate coordinates using temp table
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Countries')
BEGIN
    CREATE TABLE #CountryCoords (
        code NVARCHAR(10) NOT NULL,
        lat DECIMAL(10,7) NOT NULL,
        lng DECIMAL(10,7) NOT NULL
    );

    INSERT INTO #CountryCoords (code, lat, lng) VALUES
    ('AF', 33.9391, 67.7100),   -- Afghanistan
    ('AL', 41.1533, 20.1683),   -- Albania
    ('AG', 17.0608, -61.7964),  -- Antigua and Barbuda
    ('AN', 12.2261, -69.0601),  -- Netherlands Antilles
    ('AO', -11.2027, 17.8739),  -- Angola
    ('AV', 18.2206, -63.0686),  -- Anguilla
    ('AY', -75.2509, -0.0714),  -- Antarctica
    ('AC', 17.0608, -61.7964),  -- Antigua and Barbuda (alt)
    ('AR', -38.4161, -63.6167), -- Argentina
    ('AM', 40.0691, 45.0382),   -- Armenia
    ('AA', 12.5211, -69.9683),  -- Aruba
    ('AS', -14.2710, -170.1322),-- American Samoa
    ('AU', -25.2744, 133.7751), -- Australia
    ('AJ', 40.1431, 47.5769),   -- Azerbaijan
    ('BA', 43.9159, 17.6791),   -- Bosnia and Herzegovina
    ('BG', 42.7339, 25.4858),   -- Bulgaria
    ('BB', 13.1939, -59.5432),  -- Barbados
    ('BO', -16.2902, -63.5887), -- Bolivia
    ('BE', 50.5039, 4.4699),    -- Belgium
    ('BH', 17.1899, -88.4976),  -- Belize
    ('BN', 4.5353, 114.7277),   -- Brunei
    ('BD', 23.6850, 90.3563),   -- Bangladesh
    ('BT', 27.5142, 90.4336),   -- Bhutan
    ('BL', 17.9000, -62.8333),  -- Saint Barthélemy
    ('BK', 42.6026, 20.9030),   -- Kosovo
    ('BC', -22.3285, 24.6849),  -- Botswana
    ('BR', -14.2350, -51.9253), -- Brazil
    ('VI', 18.3358, -64.8963),  -- US Virgin Islands
    ('BX', 50.5039, 4.4699),    -- Belgium (alt)
    ('BU', 42.7339, 25.4858),   -- Bulgaria / Burma (Myanmar 21.9162, 95.9560)
    ('UV', 12.2383, -1.5616),   -- Burkina Faso
    ('BM', 32.3078, -64.7505),  -- Bermuda
    ('BY', 53.7098, 27.9534),   -- Belarus
    ('CV', 16.5388, -23.0418),  -- Cape Verde
    ('CB', 12.5657, 104.9910),  -- Cambodia
    ('CM', 6.6111, 20.9394),    -- Cameroon
    ('CA', 56.1304, -106.3468), -- Canada
    ('CJ', 19.3133, -81.2546),  -- Cayman Islands
    ('CT', 6.6111, 20.9394),    -- Central African Republic
    ('CD', -4.0383, 21.7587),   -- DRC
    ('CI', 7.5400, -5.5471),    -- Côte d'Ivoire
    ('CO', 4.5709, -74.2973),   -- Colombia
    ('CN', 35.8617, 104.1954),  -- China
    ('CS', 49.8175, 15.4730),   -- Czech Republic / Serbia
    ('IV', 7.5400, -5.5471),    -- Côte d'Ivoire (alt)
    ('HR', 45.1000, 15.2000),   -- Croatia
    ('CU', 21.5218, -77.7812),  -- Cuba
    ('UC', 12.1696, -68.9900),  -- Curaçao
    ('CY', 35.1264, 33.4299),   -- Cyprus
    ('CG', -0.2280, 15.8277),   -- Congo
    ('DJ', 11.8251, 42.5903),   -- Djibouti
    ('DO', 18.7357, -70.1627),  -- Dominican Republic
    ('DR', 18.7357, -70.1627),  -- Dominican Republic (alt)
    ('EC', -1.8312, -78.1834),  -- Ecuador
    ('EG', 26.8206, 30.8025),   -- Egypt
    ('ES', 40.4637, -3.7492),   -- Spain
    ('EK', 1.6508, 10.2679),    -- Equatorial Guinea
    ('ER', 15.1794, 39.7823),   -- Eritrea
    ('EN', 58.5953, 25.0136),   -- Estonia
    ('WZ', -26.5225, 31.4659),  -- Eswatini
    ('ET', 9.1450, 40.4897),    -- Ethiopia
    ('FM', 7.4256, 150.5508),   -- Micronesia
    ('FJ', -17.7134, 178.0650), -- Fiji
    ('FI', 61.9241, 25.7482),   -- Finland
    ('FR', 46.2276, 2.2137),    -- France
    ('FP', -17.6797, -149.4068),-- French Polynesia
    ('GB', 55.3781, -3.4360),   -- United Kingdom
    ('GG', 49.4657, -2.5853),   -- Guernsey
    ('GM', 13.4432, -15.3101),  -- Gambia
    ('GH', 7.9465, -1.0232),    -- Ghana
    ('GR', 39.0742, 21.8243),   -- Greece
    ('GL', 71.7069, -42.6043),  -- Greenland
    ('GJ', 42.3154, 43.3569),   -- Georgia
    ('GT', 15.7835, -90.2308),  -- Guatemala
    ('GV', 9.9456, -9.6966),    -- Guinea
    ('GW', 11.8037, -15.1804),  -- Guinea-Bissau
    ('GY', 4.8604, -58.9302),   -- Guyana
    ('HA', 18.9712, -72.2852),  -- Haiti
    ('HO', 15.2000, -86.2419),  -- Honduras
    ('HU', 47.1625, 19.5033),   -- Hungary
    ('IC', 28.2916, -16.6291),  -- Canary Islands (Spain)
    ('IN', 20.5937, 78.9629),   -- India
    ('ID', -0.7893, 113.9213),  -- Indonesia
    ('IR', 32.4279, 53.6880),   -- Iran
    ('IZ', 33.2232, 43.6793),   -- Iraq
    ('EI', 53.1424, -7.6921),   -- Ireland
    ('IT', 41.8719, 12.5674),   -- Italy
    ('JM', 18.1096, -77.2975),  -- Jamaica
    ('JA', 36.2048, 138.2529),  -- Japan
    ('JO', 30.5852, 36.2384),   -- Jordan
    ('KZ', 48.0196, 66.9237),   -- Kazakhstan
    ('KE', -0.0236, 37.9062),   -- Kenya
    ('DA', 56.2639, 9.5018),    -- Denmark
    ('KR', 35.9078, 127.7669),  -- South Korea
    ('KV', 42.6026, 20.9030),   -- Kosovo
    ('KU', 29.3117, 47.4818),   -- Kuwait
    ('KG', 41.2044, 74.7661),   -- Kyrgyzstan
    ('LA', 19.8563, 102.4955),  -- Laos
    ('LG', 56.8796, 24.6032),   -- Latvia
    ('LE', 33.8547, 35.8623),   -- Lebanon
    ('LT', 55.1694, 23.8813),   -- Lithuania
    ('LI', 47.1660, 9.5554),    -- Liechtenstein
    ('LY', 26.3351, 17.2283),   -- Libya
    ('LS', -29.6100, 28.2336),  -- Lesotho
    ('LH', 56.8796, 24.6032),   -- Latvia (alt)
    ('LU', 49.8153, 6.1296),    -- Luxembourg
    ('MA', 31.7917, -7.0926),   -- Morocco
    ('MI', -13.2543, 34.3015),  -- Malawi
    ('MY', 4.2105, 101.9758),   -- Malaysia
    ('MV', 3.2028, 73.2207),    -- Maldives
    ('ML', 17.5707, -3.9962),   -- Mali
    ('MT', 35.9375, 14.3754),   -- Malta
    ('RM', -21.1151, 55.5364),  -- Réunion
    ('MR', 21.0079, -10.9408),  -- Mauritania
    ('MP', 15.0979, 145.6739),  -- Northern Mariana Islands
    ('MX', 23.6345, -102.5528), -- Mexico
    ('MD', 47.4116, 28.3699),   -- Moldova
    ('MG', -18.7669, 46.8691),  -- Madagascar
    ('MJ', 42.7087, 19.3744),   -- Montenegro
    ('MH', 7.1315, 171.1845),   -- Marshall Islands
    ('MO', 22.1987, 113.5439),  -- Macau
    ('MZ', -18.6657, 35.5296),  -- Mozambique
    ('WA', -22.9576, 18.4904),  -- Namibia
    ('NR', -0.5228, 166.9315),  -- Nauru
    ('NP', 28.3949, 84.1240),   -- Nepal
    ('NL', 52.1326, 5.2913),    -- Netherlands
    ('NC', -20.9043, 165.6180), -- New Caledonia
    ('NZ', -40.9006, 174.8860), -- New Zealand
    ('NU', -19.0544, -169.8672),-- Niue
    ('NG', 9.0820, 8.6753),     -- Nigeria
    ('NI', 12.8654, -85.2072),  -- Nicaragua
    ('KN', 17.3578, -62.7830),  -- Saint Kitts and Nevis
    ('MK', 41.5124, 21.7453),   -- North Macedonia
    ('NO', 60.4720, 8.4689),    -- Norway
    ('MU', -20.3484, 57.5522),  -- Mauritius
    ('PK', 30.3753, 69.3451),   -- Pakistan
    ('PS', 31.9522, 35.2332),   -- Palestine
    ('PM', 46.8852, -56.3159),  -- Saint Pierre and Miquelon
    ('PP', -6.3150, 143.9555),  -- Papua New Guinea
    ('PA', 8.5380, -80.7821),   -- Panama
    ('PE', -9.1900, -75.0152),  -- Peru
    ('RP', 12.8797, 121.7740),  -- Philippines
    ('PL', 51.9194, 19.1451),   -- Poland
    ('PO', 39.3999, -8.2245),   -- Portugal
    ('QA', 25.3548, 51.1839),   -- Qatar
    ('CF', 6.6111, 20.9394),    -- Central African Republic
    ('RO', 45.9432, 24.9668),   -- Romania
    ('RS', 44.0165, 21.0059),   -- Serbia
    ('RW', -1.9403, 29.8739),   -- Rwanda
    ('SC', -4.6796, 55.4920),   -- Seychelles
    ('ST', 0.1864, 6.6131),     -- São Tomé and Príncipe
    ('VC', 12.9843, -61.2872),  -- Saint Vincent and the Grenadines
    ('WS', -13.7590, -172.1046),-- Samoa
    ('TP', -8.8742, 125.7275),  -- East Timor
    ('SA', 23.8859, 45.0792),   -- Saudi Arabia
    ('SG', 1.3521, 103.8198),   -- Singapore
    ('RI', -0.7893, 113.9213),  -- Indonesia (alt)
    ('SE', 60.1282, 18.6435),   -- Sweden
    ('SL', 8.4606, -11.7799),   -- Sierra Leone
    ('SN', 14.7167, -17.4677),  -- Senegal
    ('LO', 48.6690, 19.6990),   -- Slovakia
    ('SI', 46.1512, 14.9955),   -- Slovenia
    ('BP', -9.6457, 160.1562),  -- Solomon Islands
    ('SO', 5.1521, 46.1996),    -- Somalia
    ('SF', -30.5595, 22.9375),  -- South Africa (old code)
    ('KS', 6.8770, 31.3070),    -- South Sudan
    ('OD', 6.8770, 31.3070),    -- South Sudan (alt)
    ('SP', 5.1521, 46.1996),    -- Somalia (alt)
    ('CE', 7.8731, 80.7718),    -- Sri Lanka
    ('SU', 61.5240, 105.3188),  -- Russia (ex-USSR center)
    ('NS', 3.9193, -56.0278),   -- Suriname
    ('SW', -26.5225, 31.4659),  -- Eswatini (alt)
    ('SR', 3.9193, -56.0278),   -- Suriname (alt)
    ('SY', 34.8021, 38.9968),   -- Syria
    ('TW', 23.6978, 120.9605),  -- Taiwan
    ('TI', 38.8610, 71.2761),   -- Tajikistan
    ('TZ', -6.3690, 34.8888),   -- Tanzania
    ('TH', 15.8700, 100.9925),  -- Thailand
    ('BF', 12.2383, -1.5616),   -- Burkina Faso
    ('GA', -0.8037, 11.6094),   -- Gabon
    ('TT', 10.6918, -61.2225),  -- Trinidad and Tobago
    ('TO', -21.1789, -175.1982),-- Tonga
    ('TN', 33.8869, 9.5375),    -- Tunisia
    ('TD', 15.4542, 18.7322),   -- Chad
    ('TS', 33.8869, 9.5375),    -- Tunisia (alt)
    ('TU', 38.9637, 35.2433),   -- Türkiye
    ('TX', 38.9697, 59.5563),   -- Turkmenistan
    ('TK', -9.2002, -171.8484), -- Tokelau
    ('TV', -7.1095, 177.6493),  -- Tuvalu
    ('UG', 1.3733, 32.2903),    -- Uganda
    ('UP', 48.3794, 31.1656),   -- Ukraine
    ('AE', 23.4241, 53.8478),   -- UAE
    ('UK', 55.3781, -3.4360),   -- United Kingdom (alt)
    ('UY', -32.5228, -55.7658), -- Uruguay
    ('UZ', 41.3775, 64.5853),   -- Uzbekistan
    ('NH', -15.3767, 166.9592), -- Vanuatu
    ('VE', 6.4238, -66.5897),   -- Venezuela
    ('VM', 14.0583, 108.2772),  -- Vietnam
    ('YM', 15.5527, 48.5164),   -- Yemen
    ('ZA', -30.5595, 22.9375),  -- South Africa
    ('ZI', -19.0154, 29.1549),  -- Zimbabwe
    ('CH', 46.8182, 8.2275),    -- Switzerland
    ('HK', 22.3193, 114.1694);  -- Hong Kong

    UPDATE c
    SET c.latitude = t.lat, c.longitude = t.lng
    FROM [dbo].[Countries] c
    INNER JOIN #CountryCoords t
        ON UPPER(LTRIM(RTRIM(c.code))) = UPPER(LTRIM(RTRIM(t.code)));

    DROP TABLE #CountryCoords;
END
GO
