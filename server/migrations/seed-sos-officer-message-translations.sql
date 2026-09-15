-- Seed SOS officer-facing message translations (Teams + SMS)
-- Tables: SYS_ATTRIBUTE_DEF + SYS_ATTRIBUTE_DEF_TRANS
-- Safe to re-run (idempotent MERGE).
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRAN;

DECLARE @AttributeNames TABLE (AttributeName NVARCHAR(256) NOT NULL PRIMARY KEY);
INSERT INTO @AttributeNames (AttributeName) VALUES
  (N'userNeedsAssistance'),
  (N'someoneNeedsAssistance'),
  (N'acceptAndRespond'),
  (N'sosAlert'),
  (N'isYourFirstResponderAndIsHandlingYourSOS'),
  (N'youAreAlreadyTheFirstResponderForThisSOS'),
  (N'isAlreadyTheResponderForSosFrom'),
  (N'isTheFirstResponderForSosFrom'),
  (N'youAreNowTheFirstResponder'),
  (N'andTheFollowingEmergencyContactsHaveBeenNotified'),
  (N'hasBeenNotified'),
  (N'youAreNowTheFirstResponderForSosRequest'),
  (N'isTheFirstResponderForSosRequest');

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
  (N'userNeedsAssistance', 10000, N'{name} needs assistance.'),
  (N'someoneNeedsAssistance', 10000, N'Someone needs assistance.'),
  (N'acceptAndRespond', 10000, N'Accept and respond'),
  (N'sosAlert', 10000, N'SOS Alert'),
  (N'isYourFirstResponderAndIsHandlingYourSOS', 10000, N'{name} is your first responder and is handling your SOS.'),
  (N'youAreAlreadyTheFirstResponderForThisSOS', 10000, N'You are already the first responder for this SOS.'),
  (N'isAlreadyTheResponderForSosFrom', 10000, N'{responder} is already the responder for the SOS request from {requester}'),
  (N'isTheFirstResponderForSosFrom', 10000, N'{responder} is the first responder for the SOS request from {requester}.'),
  (N'youAreNowTheFirstResponder', 10000, N'You are now the first responder.'),
  (N'andTheFollowingEmergencyContactsHaveBeenNotified', 10000, N'and the following emergency contacts have been notified:'),
  (N'hasBeenNotified', 10000, N'has been notified.'),
  (N'youAreNowTheFirstResponderForSosRequest', 10000, N'You are now the first responder for {requester}''s SOS request.'),
  (N'isTheFirstResponderForSosRequest', 10000, N'{responder} is the first responder for {requester}''s SOS request.');

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
