-- Seed additional SOS comment + /acceptSOS web message translations
-- Tables: SYS_ATTRIBUTE_DEF + SYS_ATTRIBUTE_DEF_TRANS
-- Safe to re-run (idempotent MERGE).
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRAN;

DECLARE @AttributeNames TABLE (AttributeName NVARCHAR(256) NOT NULL PRIMARY KEY);
INSERT INTO @AttributeNames (AttributeName) VALUES
  (N'userHasCommented'),
  (N'addedAComment'),
  (N'someoneElseHasAlreadyRespondedToThisSOS'),
  (N'anotherResponderIsHandlingThisRequest'),
  (N'thankYouForYourResponse'),
  (N'requesterAndFollowingEmergencyContactsNotified'),
  (N'nameHasBeenNotified');

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
  (N'userHasCommented', 10000, N'User {name} has commented : {comment}'),
  (N'addedAComment', 10000, N'{name} added a comment - {comment}'),
  (N'someoneElseHasAlreadyRespondedToThisSOS', 10000, N'Someone else has already responded to this SOS.'),
  (N'anotherResponderIsHandlingThisRequest', 10000, N'Another responder is handling this request.'),
  (N'thankYouForYourResponse', 10000, N'Thank you for your response.'),
  (N'requesterAndFollowingEmergencyContactsNotified', 10000, N'{name} and the following emergency contacts have been notified: {contacts}.'),
  (N'nameHasBeenNotified', 10000, N'{name} has been notified.');

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
