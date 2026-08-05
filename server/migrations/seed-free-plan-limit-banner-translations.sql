-- Seed freePlanLimitBannerMessage / freePlanLimitBannerSuffix for free-plan 10-user limit banner
-- Tables: SYS_ATTRIBUTE_DEF + SYS_ATTRIBUTE_DEF_TRANS
-- Safe to re-run (idempotent MERGE).
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRAN;

DECLARE @AttributeNames TABLE (AttributeName NVARCHAR(256) NOT NULL PRIMARY KEY);
INSERT INTO @AttributeNames (AttributeName) VALUES
  (N'freePlanLimitBannerMessage'),
  (N'freePlanLimitBannerSuffix');

INSERT INTO SYS_ATTRIBUTE_DEF (ATTRIBUTE)
SELECT a.AttributeName
FROM @AttributeNames a
WHERE NOT EXISTS (
  SELECT 1 FROM SYS_ATTRIBUTE_DEF sa WHERE sa.ATTRIBUTE = a.AttributeName
);

DECLARE @SourceRows TABLE (
  AttributeName NVARCHAR(256) NOT NULL,
  LanguageId INT NOT NULL,
  TranslatedAttribute NVARCHAR(MAX) NOT NULL
);

INSERT INTO @SourceRows (AttributeName, LanguageId, TranslatedAttribute) VALUES
  (N'freePlanLimitBannerMessage', 10000, N'You''ve reached the free plan limit of 10 users.'),
  (N'freePlanLimitBannerSuffix', 10000, N'to add more users.'),
  (N'freePlanLimitBannerMessage', 10048, N'Դուք հասել եք անվճար պլանի 10 օգտատերերի սահմանին։'),
  (N'freePlanLimitBannerSuffix', 10048, N'ավելի շատ օգտատերեր ավելացնելու համար։');

MERGE SYS_ATTRIBUTE_DEF_TRANS AS T
USING (
  SELECT sa.ATTRIBUTE_ID, s.LanguageId AS LANGUAGE_ID, s.TranslatedAttribute
  FROM @SourceRows s
  INNER JOIN SYS_ATTRIBUTE_DEF sa ON sa.ATTRIBUTE = s.AttributeName
) AS S
ON T.ATTRIBUTE_ID = S.ATTRIBUTE_ID
  AND T.LANGUAGE_ID = S.LANGUAGE_ID
WHEN MATCHED THEN
  UPDATE SET ATTRIBUTE = S.TranslatedAttribute
WHEN NOT MATCHED THEN
  INSERT (ATTRIBUTE_ID, LANGUAGE_ID, ATTRIBUTE)
  VALUES (S.ATTRIBUTE_ID, S.LANGUAGE_ID, S.TranslatedAttribute);

COMMIT TRAN;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRAN;
  THROW;
END CATCH;
