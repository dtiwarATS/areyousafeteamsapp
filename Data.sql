IF NOT EXISTS(SELECT * FROM [GEN_LIST] WHERE [ID] = 1)
BEGIN
	SET IDENTITY_INSERT [DBO].[GEN_LIST] ON
	INSERT [DBO].[GEN_LIST] ([ID], [LIST_NAME]) 
	VALUES (1, N'Incident Status') 
	SET IDENTITY_INSERT [DBO].[GEN_LIST] OFF
END
GO

IF NOT EXISTS(SELECT * FROM [GEN_LIST_ITEM] WHERE [ID] = 1)
BEGIN
	SET IDENTITY_INSERT [DBO].[GEN_LIST_ITEM] ON
	INSERT [DBO].[GEN_LIST_ITEM] ([id], [LIST_ID], [LIST_ITEM])
	VALUES (1, 1, N'In progress')
	SET IDENTITY_INSERT [DBO].[GEN_LIST_ITEM] OFF
END
GO

IF NOT EXISTS(SELECT * FROM [GEN_LIST_ITEM] WHERE [ID] = 2)
BEGIN
	SET IDENTITY_INSERT [DBO].[GEN_LIST_ITEM] ON
	INSERT [DBO].[GEN_LIST_ITEM] ([id], [LIST_ID], [LIST_ITEM])
	VALUES (2, 1, N'Closed')
	SET IDENTITY_INSERT [DBO].[GEN_LIST_ITEM] OFF
END
GO

IF NOT EXISTS(SELECT * FROM [MSTeamsIncidentType] WHERE [ID] = 1)
BEGIN
	SET IDENTITY_INSERT [DBO].[MSTeamsIncidentType] ON
	INSERT [DBO].[MSTeamsIncidentType] ([id], [incident_type])
	VALUES (1, 'Safety Check')
	SET IDENTITY_INSERT [DBO].[MSTeamsIncidentType] OFF
END
GO

IF NOT EXISTS(SELECT * FROM [MSTeamsIncidentType] WHERE [ID] = 2)
BEGIN
	SET IDENTITY_INSERT [DBO].[MSTeamsIncidentType] ON
	INSERT [DBO].[MSTeamsIncidentType] ([id], [incident_type])
	VALUES (2, 'Safety Alert')
	SET IDENTITY_INSERT [DBO].[MSTeamsIncidentType] OFF
END
GO

IF NOT EXISTS(SELECT * FROM [MSTeamsIncidentType] WHERE [ID] = 3)
BEGIN
	SET IDENTITY_INSERT [DBO].[MSTeamsIncidentType] ON
	INSERT [DBO].[MSTeamsIncidentType] ([id], [incident_type])
	VALUES (3, 'Important Bulletin')
	SET IDENTITY_INSERT [DBO].[MSTeamsIncidentType] OFF
END
GO

IF NOT EXISTS(SELECT * FROM [MSTeamsIncidentType] WHERE [ID] = 4)
BEGIN
	SET IDENTITY_INSERT [DBO].[MSTeamsIncidentType] ON
	INSERT [DBO].[MSTeamsIncidentType] ([id], [incident_type])
	VALUES (4, 'Travel Advisory')
	SET IDENTITY_INSERT [DBO].[MSTeamsIncidentType] OFF
END
GO

IF NOT EXISTS(SELECT * FROM [MSTeamsIncidentType] WHERE [ID] = 5)
BEGIN
	SET IDENTITY_INSERT [DBO].[MSTeamsIncidentType] ON
	INSERT [DBO].[MSTeamsIncidentType] ([id], [incident_type])
	VALUES (5, 'Stakeholder Notice')
	SET IDENTITY_INSERT [DBO].[MSTeamsIncidentType] OFF
END
GO