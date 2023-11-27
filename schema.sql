
IF (NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsInstallationDetails'))
BEGIN
	CREATE TABLE MSTeamsInstallationDetails (
	id INT IDENTITY(101,1) NOT NULL PRIMARY KEY,
	user_id VARCHAR(500) NOT NULL,
	user_tenant_id VARCHAR(255) NOT NULL,
    user_obj_id VARCHAR(255) NOT NULL,
	user_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
	team_id VARCHAR(100) NOT NULL,
	team_name VARCHAR(255) NOT NULL,
	super_users VARCHAR(max),
    created_date VARCHAR(100) NOT NULL,
	);
END
GO

IF (NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsIncidents'))
BEGIN
	CREATE TABLE MSTeamsIncidents (
	id INT IDENTITY(100001,1) NOT NULL PRIMARY KEY,
	inc_name nvarchar(255) NOT NULL,
	inc_desc nvarchar(max) DEFAULT NULL,
	inc_type VARCHAR(100)  NOT NULL,
	channel_id VARCHAR(100) NOT NULL,
	team_id VARCHAR(100),
	selected_members VARCHAR(max),
	created_by VARCHAR(100)  NOT NULL,
	created_date VARCHAR(255) NOT NULL,
	);
END
GO

IF (NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsMemberResponses'))
BEGIN
	CREATE TABLE MSTeamsMemberResponses (
	id INT NOT NULL PRIMARY KEY IDENTITY(1,1),
	inc_id INT NOT NULL,
	user_id varchar(255),
	user_name varchar(255),	
	is_message_delivered bit,
	response bit,
	response_value bit,
	comment varchar(max),
	[timestamp] datetime,
	--CONSTRAINT fk_event_member_response FOREIGN KEY(event_id) REFERENCES event(id)
	);
END
GO

IF (NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsFeedback'))
BEGIN
	CREATE TABLE MSTeamsFeedback (
	id INT NOT NULL PRIMARY KEY IDENTITY(1,1),
	user_id VARCHAR(255),
	team_id VARCHAR(100),
	email VARCHAR(max),
	content VARCHAR(max)
	)
END
GO

IF (NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsAssistance'))
BEGIN
	CREATE TABLE MSTeamsAssistance (
	id INT IDENTITY(100001,1) NOT NULL PRIMARY KEY,
	user_id VARCHAR(100) NOT NULL,
	sent_to_ids NVARCHAR(MAX),
	sent_to_names NVARCHAR(MAX) NOT NULL,
	comments NVARCHAR(MAX)  NOT NULL,
	requested_date VARCHAR(255) NOT NULL,
	comment_date VARCHAR(255) NOT NULL
	);
END
GO

----- Start Task 140 -----
IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='OCCURS_EVERY' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTEAMSINCIDENTS ADD OCCURS_EVERY NVARCHAR(26) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='EVENT_START_DATE' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD EVENT_START_DATE NVARCHAR(20) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='EVENT_START_TIME' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD EVENT_START_TIME NVARCHAR(16) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='EVENT_END_DATE' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD EVENT_END_DATE NVARCHAR(20) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='EVENT_END_TIME' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD EVENT_END_TIME NVARCHAR(16) NULL
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTEAMS_SUB_EVENT')
BEGIN
	CREATE TABLE MSTEAMS_SUB_EVENT (
	ID INT IDENTITY(100001,1) NOT NULL,
	INC_ID INT NOT NULL,
	SUB_EVENT_TYPE VARCHAR(512)  NOT NULL,
	CRON VARCHAR(512) NOT NULL,
	RUN_AT VARCHAR(512) NOT NULL,
	TIMEZONE VARCHAR(256) NOT NULL,
	COMPLETED BIT,
	CONSTRAINT PK_MSTEAMS_SUB_EVENT PRIMARY KEY CLUSTERED 
	(
		ID ASC
	)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
	) ON [PRIMARY]

	ALTER TABLE DBO.MSTEAMS_SUB_EVENT  WITH CHECK ADD  CONSTRAINT FK_MSTEAMS_SUB_EVENT_INC_ID FOREIGN KEY(INC_ID)
	REFERENCES DBO.MSTeamsIncidents (ID)
	ALTER TABLE DBO.MSTEAMS_SUB_EVENT CHECK CONSTRAINT FK_MSTEAMS_SUB_EVENT_INC_ID
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='CREATED_BY_NAME' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD CREATED_BY_NAME NVARCHAR(512) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='LAST_RUN_AT' AND TABLE_NAME='MSTEAMS_SUB_EVENT')
BEGIN
ALTER TABLE MSTEAMS_SUB_EVENT ADD LAST_RUN_AT NVARCHAR(512) NULL
END
GO
----- End Task 140 ----- 
----- Start Task 113-----
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsMemberResponsesRecurr')
BEGIN
	CREATE TABLE [dbo].[MSTeamsMemberResponsesRecurr](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[memberResponsesId] [int] NOT NULL,
	[runAt] [varchar](100) NULL,
	[is_message_delivered] [bit] NULL,
	[response] [bit] NULL,
	[response_value] [bit] NULL,
	[comment] [varchar](max) NULL,
	[conversationId] [varchar](512) NULL,
	[activityId] [varchar](512) NULL,
	PRIMARY KEY CLUSTERED 
	(
		[id] ASC
	)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
	) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]

	ALTER TABLE DBO.MSTeamsMemberResponsesRecurr  WITH CHECK ADD  CONSTRAINT FK_MSTeamsMemberResponsesRecurr_memberResponsesId FOREIGN KEY([memberResponsesId])
	REFERENCES DBO.MSTeamsMemberResponses (ID)
	ALTER TABLE DBO.MSTeamsMemberResponsesRecurr CHECK CONSTRAINT FK_MSTeamsMemberResponsesRecurr_memberResponsesId
END
GO
----- End Task 113-----


------ Start 87 ------
IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='GUIDANCE' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD GUIDANCE NVARCHAR(4000) NULL
END
GO
------ End 87 ------
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'FK_MSTEAMS_SUB_EVENT_INC_ID')
   AND parent_object_id = OBJECT_ID(N'dbo.MSTEAMS_SUB_EVENT'))
BEGIN
	ALTER TABLE MSTEAMS_SUB_EVENT
	DROP CONSTRAINT FK_MSTEAMS_SUB_EVENT_INC_ID;

	ALTER TABLE MSTEAMS_SUB_EVENT  WITH NOCHECK ADD CONSTRAINT FK_MSTEAMS_SUB_EVENT_INC_ID
	FOREIGN KEY (INC_ID) REFERENCES MSTEAMSINCIDENTS (ID) ON DELETE CASCADE;
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='IS_DELETED' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD IS_DELETED BIT
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsIncResponseSelectedUsers')
BEGIN
	CREATE TABLE [dbo].[MSTeamsIncResponseSelectedUsers](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[inc_id] [int] NOT NULL,
	[user_id] [varchar](256) NOT NULL,
	[user_name] [varchar](100) NULL
	PRIMARY KEY CLUSTERED 
	(
		[id] ASC
	)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
	) ON [PRIMARY] 

	ALTER TABLE DBO.MSTeamsIncResponseSelectedUsers  WITH CHECK ADD  CONSTRAINT FK_IncResponseSelectedUsers_Incidents FOREIGN KEY([inc_id])
	REFERENCES DBO.MSTeamsIncidents (ID) ON DELETE CASCADE
	ALTER TABLE DBO.MSTeamsIncResponseSelectedUsers CHECK CONSTRAINT FK_IncResponseSelectedUsers_Incidents
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsIncResponseUserTS')
BEGIN
	CREATE TABLE [dbo].[MSTeamsIncResponseUserTS](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[incResponseSelectedUserId] [int] NOT NULL,
	[runAt] [varchar](100) NULL,
	[conversationId] [varchar](512) NULL,
	[activityId] [varchar](512) NULL,
	PRIMARY KEY CLUSTERED 
	(
		[id] ASC
	)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
	) ON [PRIMARY] 

	ALTER TABLE DBO.MSTeamsIncResponseUserTS  WITH CHECK ADD  CONSTRAINT FK_MSTeamsIncResponseUserTS_MSTeamsIncResponseSelectedUsers FOREIGN KEY([incResponseSelectedUserId])
	REFERENCES DBO.MSTeamsIncResponseSelectedUsers (ID) ON DELETE CASCADE
	ALTER TABLE DBO.MSTeamsIncResponseUserTS CHECK CONSTRAINT FK_MSTeamsIncResponseUserTS_MSTeamsIncResponseSelectedUsers
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'GEN_LIST')
BEGIN
	CREATE TABLE [dbo].[GEN_LIST](
	[id] [int] IDENTITY(100000,1) NOT NULL,
	[LIST_NAME] [varchar](512) NOT NULL,
	PRIMARY KEY CLUSTERED 
	(
		[id] ASC
	)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
	) ON [PRIMARY]
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'GEN_LIST_ITEM')
BEGIN
	CREATE TABLE [dbo].[GEN_LIST_ITEM](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[LIST_ID] [int] NOT NULL,
	[LIST_ITEM] [varchar](512) NOT NULL,
	PRIMARY KEY CLUSTERED 
	(
		[id] ASC
	)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
	) ON [PRIMARY]

	ALTER TABLE DBO.GEN_LIST_ITEM  WITH CHECK ADD  CONSTRAINT FK_GEN_LIST_ITEM_LIST_ID FOREIGN KEY([LIST_ID])
	REFERENCES DBO.GEN_LIST (ID) ON DELETE CASCADE
	ALTER TABLE DBO.GEN_LIST_ITEM CHECK CONSTRAINT FK_GEN_LIST_ITEM_LIST_ID
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='INC_STATUS_ID' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD INC_STATUS_ID INT

ALTER TABLE [DBO].MSTeamsIncidents  WITH NOCHECK ADD  CONSTRAINT [FK_MSTeamsIncidents_INC_STATUS_ID] FOREIGN KEY(INC_STATUS_ID)
REFERENCES [DBO].GEN_LIST_ITEM (ID)
ALTER TABLE [DBO].MSTeamsIncidents CHECK CONSTRAINT [FK_MSTeamsIncidents_INC_STATUS_ID]

END
GO

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'FK_MSTeamsMemberResponses_INC_ID')
   AND parent_object_id = OBJECT_ID(N'dbo.MSTeamsMemberResponses'))
BEGIN
	ALTER TABLE MSTeamsMemberResponses  WITH NOCHECK ADD CONSTRAINT FK_MSTeamsMemberResponses_INC_ID
	FOREIGN KEY (INC_ID) REFERENCES MSTEAMSINCIDENTS (ID) ON DELETE CASCADE;
END
GO

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE object_id = OBJECT_ID(N'FK_MemberResponsesRecurr_memberResponsesId')
   AND parent_object_id = OBJECT_ID(N'dbo.MSTeamsMemberResponsesRecurr'))
BEGIN
	ALTER TABLE MSTeamsMemberResponsesRecurr  WITH NOCHECK ADD CONSTRAINT FK_MemberResponsesRecurr_memberResponsesId
	FOREIGN KEY (memberResponsesId) REFERENCES MSTeamsMemberResponses (ID) ON DELETE CASCADE;
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsTeamsUsers')
BEGIN
	CREATE TABLE [dbo].[MSTeamsTeamsUsers](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[team_id] [varchar](256) NOT NULL,
	[user_aadobject_id] [varchar](256) NOT NULL,
	[user_id] [varchar](256) NOT NULL,
	[user_name] [varchar](100) NULL
	PRIMARY KEY CLUSTERED 
	(
		[id] ASC
	)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
	) ON [PRIMARY]
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsLog')
BEGIN
	CREATE TABLE [dbo].[MSTeamsLog](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[inc_id] [int],
	[log] nvarchar(max),
	[datetime] datetime,
	PRIMARY KEY CLUSTERED 
	(
		[id] ASC
	)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
	) ON [PRIMARY]
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='serviceUrl' AND TABLE_NAME='msteamsinstallationdetails')
BEGIN
ALTER TABLE msteamsinstallationdetails ADD serviceUrl nvarchar(256)
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='isUserInfoSaved' AND TABLE_NAME='MSTeamsInstallationDetails')
BEGIN
ALTER TABLE MSTeamsInstallationDetails ADD isUserInfoSaved bit NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='userPrincipalName' AND TABLE_NAME='MSTeamsTeamsUsers')
BEGIN
ALTER TABLE MSTeamsTeamsUsers ADD userPrincipalName nvarchar(100) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='email' AND TABLE_NAME='MSTeamsTeamsUsers')
BEGIN
ALTER TABLE MSTeamsTeamsUsers ADD email nvarchar(100) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='tenantid' AND TABLE_NAME='MSTeamsTeamsUsers')
BEGIN
ALTER TABLE MSTeamsTeamsUsers ADD tenantid nvarchar(100) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='userRole' AND TABLE_NAME='MSTeamsTeamsUsers')
BEGIN
ALTER TABLE MSTeamsTeamsUsers ADD userRole nvarchar(100) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='team_ids' AND TABLE_NAME='MSTeamsAssistance')
BEGIN
ALTER TABLE MSTeamsAssistance ADD team_ids NVARCHAR(max) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='uninstallation_date' AND TABLE_NAME='msteamsinstallationdetails')
BEGIN
ALTER TABLE msteamsinstallationdetails ADD uninstallation_date varchar(100) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='uninstallation_user_aadObjid' AND TABLE_NAME='msteamsinstallationdetails')
BEGIN
ALTER TABLE msteamsinstallationdetails ADD uninstallation_user_aadObjid varchar(100) NULL
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SYS_ERROR_LOGGER')
BEGIN
	CREATE TABLE SYS_ERROR_LOGGER (
	ID INT IDENTITY(100001,1) NOT NULL,
	BOT_NAME NVARCHAR(256) NOT NULL,
	ERROR_MESSAGE NVARCHAR(MAX) NOT NULL,
	ERROR_DETAILS NVARCHAR(MAX) NULL,
	USER_NAME NVARCHAR(256) NULL,
	TEAM_NAME NVARCHAR(512) NULL,
	ERROR_DATE NVARCHAR(100) NULL	
	CONSTRAINT PK_SYS_ERROR_LOGGER PRIMARY KEY CLUSTERED 
	(
		ID ASC
	)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
	) ON [PRIMARY]
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsSubscriptionDetails')
BEGIN
	CREATE TABLE MSTeamsSubscriptionDetails (
	[ID] INT IDENTITY(100001,1) NOT NULL,	
	[Timestamp] NVARCHAR(128) NULL,
	[Action] NVARCHAR(128) NULL,
	[SubscriptionDate] Date NULL,
	[ExpiryDate] Date NULL,
	[isProcessed] bit NULL,
	[SubJson] NVARCHAR(max) NULL,	
	[SubscriptionId] NVARCHAR(256) NULL,
	[SubscriptionType] INTEGER NULL,
	[TenantId] NVARCHAR(256) NULL,
	[UserEmailId] NVARCHAR(256) NULL,
	[UserLimit] INTEGER NULL,
	[UserAadObjId] NVARCHAR(256) NULL,
	[TermUnit] NVARCHAR(20) NULL,
	[isFiveDayBeforeMessageSent] BIT NULL,
	[isAfterExpiryMessageSent] BIT NULL

	CONSTRAINT PK_MSTeamsSubscriptionDetails PRIMARY KEY CLUSTERED 
	(
		ID ASC
	)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
	) ON [PRIMARY]
END
GO

-------------------msteamsinstallationdetails-----------
IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='SubscriptionDetailsId' AND TABLE_NAME='msteamsinstallationdetails')
BEGIN
ALTER TABLE msteamsinstallationdetails ADD [SubscriptionDetailsId] INTEGER NULL

ALTER TABLE [DBO].msteamsinstallationdetails  WITH NOCHECK ADD  CONSTRAINT [FK_msteamsinstallationdetails_SubscriptionDetailsId] FOREIGN KEY(SubscriptionDetailsId)
REFERENCES [DBO].MSTeamsSubscriptionDetails (ID)
ALTER TABLE [DBO].msteamsinstallationdetails CHECK CONSTRAINT [FK_msteamsinstallationdetails_SubscriptionDetailsId]

END
GO
-------------------MSTeamsAssistance-----------
IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='hasLicense' AND TABLE_NAME='MSTeamsTeamsUsers')
BEGIN
ALTER TABLE MSTeamsTeamsUsers ADD hasLicense BIT NULL
END
GO
-----------------
-----------------Paid version changes Start---------------------
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsSubscriptionDetails')
BEGIN
	CREATE TABLE MSTeamsSubscriptionDetails (
	[ID] INT IDENTITY(100001,1) NOT NULL,	
	[Timestamp] NVARCHAR(128) NULL,
	[Action] NVARCHAR(128) NULL,
	[SubscriptionDate] Date NULL,
	[ExpiryDate] Date NULL,
	[isProcessed] bit NULL,
	[SubJson] NVARCHAR(max) NULL,	
	[SubscriptionId] NVARCHAR(256) NULL,
	[SubscriptionType] INTEGER NULL,
	[TenantId] NVARCHAR(256) NULL,
	[UserEmailId] NVARCHAR(256) NULL,
	[UserLimit] INTEGER NULL,
	[UserAadObjId] NVARCHAR(256) NULL,
	[TermUnit] NVARCHAR(20) NULL,
	[isFiveDayBeforeMessageSent] BIT NULL,
	[isAfterExpiryMessageSent] BIT NULL

	CONSTRAINT PK_MSTeamsSubscriptionDetails PRIMARY KEY CLUSTERED 
	(
		ID ASC
	)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
	) ON [PRIMARY]
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='isLicenseAssignedForExistingUser' AND TABLE_NAME='MSTeamsSubscriptionDetails')
BEGIN
ALTER TABLE MSTeamsSubscriptionDetails ADD isLicenseAssignedForExistingUser BIT NULL
END
GO

-------------------msteamsinstallationdetails-----------
IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='SubscriptionDetailsId' AND TABLE_NAME='msteamsinstallationdetails')
BEGIN
ALTER TABLE msteamsinstallationdetails ADD [SubscriptionDetailsId] INTEGER NULL

ALTER TABLE [DBO].msteamsinstallationdetails  WITH NOCHECK ADD  CONSTRAINT [FK_msteamsinstallationdetails_SubscriptionDetailsId] FOREIGN KEY(SubscriptionDetailsId)
REFERENCES [DBO].MSTeamsSubscriptionDetails (ID)
ALTER TABLE [DBO].msteamsinstallationdetails CHECK CONSTRAINT [FK_msteamsinstallationdetails_SubscriptionDetailsId]

END
GO
-------------------MSTeamsAssistance-----------
IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='hasLicense' AND TABLE_NAME='MSTeamsTeamsUsers')
BEGIN
ALTER TABLE MSTeamsTeamsUsers ADD hasLicense BIT NULL
END
GO
-----------------Paid version changes End-----------------------
IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='message_delivery_status' AND TABLE_NAME='MSTeamsMemberResponses')
BEGIN
ALTER TABLE MSTeamsMemberResponses ADD message_delivery_status int NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='message_delivery_error' AND TABLE_NAME='MSTeamsMemberResponses')
BEGIN
ALTER TABLE MSTeamsMemberResponses ADD message_delivery_error NVARCHAR(max) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='conversationId' AND TABLE_NAME='MSTeamsTeamsUsers')
BEGIN
ALTER TABLE MSTeamsTeamsUsers ADD conversationId nvarchar(max) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='isThreeDayBeforeMessageSent' AND TABLE_NAME='MSTeamsSubscriptionDetails')
BEGIN
ALTER TABLE MSTeamsSubscriptionDetails ADD isThreeDayBeforeMessageSent BIT NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='isSevenDayBeforeMessageSent' AND TABLE_NAME='MSTeamsSubscriptionDetails')
BEGIN
ALTER TABLE MSTeamsSubscriptionDetails ADD isSevenDayBeforeMessageSent BIT NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='isTrialExpired' AND TABLE_NAME='MSTeamsTeamsUsers')
BEGIN
ALTER TABLE MSTeamsTeamsUsers ADD isTrialExpired bit NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='previousSubscriptionType' AND TABLE_NAME='MSTeamsTeamsUsers')
BEGIN
ALTER TABLE MSTeamsTeamsUsers ADD previousSubscriptionType varchar(2) NULL
END
GO

--alter table MSTeamsMemberResponses alter column [timestamp] datetime

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='timestamp' AND TABLE_NAME='MSTeamsMemberResponsesRecurr')
BEGIN
ALTER TABLE MSTeamsMemberResponsesRecurr ADD [timestamp] datetime NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='InitDate' AND TABLE_NAME='MSTeamsSubscriptionDetails')
BEGIN
ALTER TABLE MSTeamsSubscriptionDetails ADD InitDate dateTime NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='TrialStartDate' AND TABLE_NAME='MSTeamsSubscriptionDetails')
BEGIN
ALTER TABLE MSTeamsSubscriptionDetails ADD TrialStartDate dateTime NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='SubcriptionStartDate' AND TABLE_NAME='MSTeamsSubscriptionDetails')
BEGIN
ALTER TABLE MSTeamsSubscriptionDetails ADD SubcriptionStartDate dateTime NULL
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsIncidentType')
BEGIN
	CREATE TABLE [dbo].[MSTeamsIncidentType](
	[id] [int] IDENTITY(100,1) NOT NULL,
	[incident_type] nvarchar(100) NULL
	PRIMARY KEY CLUSTERED 
	(
		[id] ASC
	)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
	) ON [PRIMARY]
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='inc_type_id' AND TABLE_NAME='msteamsincidents')
BEGIN
ALTER TABLE msteamsincidents ADD [inc_type_id] INTEGER NULL

ALTER TABLE [DBO].msteamsincidents  WITH NOCHECK ADD  CONSTRAINT [FK_msteamsincidents_incTypeId] FOREIGN KEY(inc_type_id)
REFERENCES [DBO].MSTeamsIncidentType (ID)
ALTER TABLE [DBO].msteamsincidents CHECK CONSTRAINT [FK_msteamsincidents_incTypeId]

END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='additionalInfo' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD additionalInfo nvarchar(4000) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='travelUpdate' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD travelUpdate nvarchar(512) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='contactInfo' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD contactInfo nvarchar(4000) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='situation' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD situation nvarchar(4000) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='channelId' AND TABLE_NAME='msteamsinstallationdetails')
BEGIN
ALTER TABLE msteamsinstallationdetails ADD channelId nvarchar(256)
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='channelName' AND TABLE_NAME='msteamsinstallationdetails')
BEGIN
ALTER TABLE msteamsinstallationdetails ADD channelName nvarchar(256)
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='APP_NAME' AND TABLE_NAME='SYS_ERROR_LOGGER')
BEGIN
ALTER TABLE SYS_ERROR_LOGGER ADD APP_NAME NVARCHAR(32) NULL
END
GO

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsIncResponseSelectedTeams')
BEGIN
	CREATE TABLE [dbo].[MSTeamsIncResponseSelectedTeams](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[incId] [int] NOT NULL,
	[teamId] [varchar](256) NOT NULL,
	[teamName] [varchar](256) NOT NULL,
	[channelId] [varchar](256) NOT NULL,
	[channelName] [varchar](256) NOT NULL,
	PRIMARY KEY CLUSTERED 
	(
		[id] ASC
	)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
	) ON [PRIMARY] 

	ALTER TABLE DBO.MSTeamsIncResponseSelectedTeams  WITH CHECK ADD  CONSTRAINT FK_IncResponseSelectedTeams_Incidents FOREIGN KEY([incId])
	REFERENCES DBO.MSTeamsIncidents (ID) ON DELETE CASCADE
	ALTER TABLE DBO.MSTeamsIncResponseSelectedTeams CHECK CONSTRAINT FK_IncResponseSelectedTeams_Incidents
END
GO


IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'MSTeamsNAResponseSelectedTeams')
BEGIN
	CREATE TABLE [dbo].[MSTeamsNAResponseSelectedTeams](
	[id] [int] IDENTITY(1,1) NOT NULL,
	[tenantId] [varchar](256) NOT NULL,
	[teamId] [varchar](256) NOT NULL,
	[teamName] [varchar](256) NOT NULL,
	[channelId] [varchar](256) NOT NULL,
	[channelName] [varchar](256) NOT NULL,
	PRIMARY KEY CLUSTERED 
	(
		[id] ASC
	)WITH (STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, OPTIMIZE_FOR_SEQUENTIAL_KEY = OFF) ON [PRIMARY]
	) ON [PRIMARY]
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='isTestRecord' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD isTestRecord bit NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='is_marked_by_admin' AND TABLE_NAME='MSTeamsMemberResponses')
BEGIN
ALTER TABLE MSTeamsMemberResponses ADD is_marked_by_admin bit NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='admin_aadObjId' AND TABLE_NAME='MSTeamsMemberResponses')
BEGIN
ALTER TABLE MSTeamsMemberResponses ADD admin_aadObjId varchar(255) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='admin_name' AND TABLE_NAME='MSTeamsMemberResponses')
BEGIN
ALTER TABLE MSTeamsMemberResponses ADD admin_name nvarchar(512) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='is_marked_by_admin' AND TABLE_NAME='MSTeamsMemberResponsesRecurr')
BEGIN
ALTER TABLE MSTeamsMemberResponsesRecurr ADD is_marked_by_admin bit NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='admin_aadObjId' AND TABLE_NAME='MSTeamsMemberResponsesRecurr')
BEGIN
ALTER TABLE MSTeamsMemberResponsesRecurr ADD admin_aadObjId varchar(255) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='admin_name' AND TABLE_NAME='MSTeamsMemberResponsesRecurr')
BEGIN
ALTER TABLE MSTeamsMemberResponsesRecurr ADD admin_name nvarchar(512) NULL
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='isSavedAsDraft' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD isSavedAsDraft BIT
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME='updatedOn' AND TABLE_NAME='MSTeamsIncidents')
BEGIN
ALTER TABLE MSTeamsIncidents ADD updatedOn varchar(255)
END
GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsIncidents' AND COLUMN_NAME = 'template_name') 
BEGIN 
 ALTER TABLE MSTeamsIncidents ADD template_name VARCHAR(255) NULL
END 
GO 


IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsInstallationDetails' AND COLUMN_NAME = 'EnableSafetycheckForVisitors') 
BEGIN 
 ALTER TABLE MSTeamsInstallationDetails ADD EnableSafetycheckForVisitors BIT
END 
GO 


IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsInstallationDetails' AND COLUMN_NAME = 'SafetycheckForVisitorsQuestion1') 
BEGIN 
 ALTER TABLE MSTeamsInstallationDetails ADD SafetycheckForVisitorsQuestion1 nvarchar(max)
END 
GO 

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsInstallationDetails' AND COLUMN_NAME = 'SafetycheckForVisitorsQuestion2') 
BEGIN 
 ALTER TABLE MSTeamsInstallationDetails ADD SafetycheckForVisitorsQuestion2 nvarchar(max)
END 

GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsInstallationDetails' AND COLUMN_NAME = 'SafetycheckForVisitorsQuestion3') 
BEGIN 
 ALTER TABLE MSTeamsInstallationDetails ADD SafetycheckForVisitorsQuestion3 nvarchar(max)
END 
GO 


IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsMemberResponses' AND COLUMN_NAME = 'SafetyCheckVisitorsQuestion1Response') 
BEGIN 
 ALTER TABLE MSTeamsMemberResponses ADD SafetyCheckVisitorsQuestion1Response nvarchar(max)
END 
GO 

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsMemberResponses' AND COLUMN_NAME = 'SafetyCheckVisitorsQuestion2Response') 
BEGIN 
 ALTER TABLE MSTeamsMemberResponses ADD SafetyCheckVisitorsQuestion2Response nvarchar(max)
END 

GO

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsMemberResponses' AND COLUMN_NAME = 'SafetyCheckVisitorsQuestion3Response') 
BEGIN 
 ALTER TABLE MSTeamsMemberResponses ADD SafetyCheckVisitorsQuestion3Response nvarchar(max)
END 
GO 

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsInstallationDetails' AND COLUMN_NAME = 'twoDaysPostInstallation') 
BEGIN 
 ALTER TABLE MSTeamsInstallationDetails ADD twoDaysPostInstallation BIT
END 
GO 

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsInstallationDetails' AND COLUMN_NAME = 'sevenDaysPostInstallation') 
BEGIN 
 ALTER TABLE MSTeamsInstallationDetails ADD sevenDaysPostInstallation BIT
END 
GO 

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsInstallationDetails' AND COLUMN_NAME = 'fifteenDaysPostInstallation') 
BEGIN 
 ALTER TABLE MSTeamsInstallationDetails ADD fifteenDaysPostInstallation BIT
END 
GO 


IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsIncidents' AND COLUMN_NAME = 'EnableSendReminders') 
BEGIN 
 ALTER TABLE MSTeamsIncidents ADD EnableSendReminders BIT
END 
GO 

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsIncidents' AND COLUMN_NAME = 'SendRemindersCount') 
BEGIN 
 ALTER TABLE MSTeamsIncidents ADD SendRemindersCount  int DEFAULT  0 not null

END 
GO 

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsIncidents' AND COLUMN_NAME = 'SendRemindersTime') 
BEGIN 
 ALTER TABLE MSTeamsIncidents ADD SendRemindersTime  int DEFAULT  0 not null

END 
GO 


IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsMemberResponses' AND COLUMN_NAME = 'SendRemindersCounter') 
BEGIN 
 ALTER TABLE MSTeamsMemberResponses ADD SendRemindersCounter  int DEFAULT  0 not null

END 
GO 

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsMemberResponses' AND COLUMN_NAME = 'LastReminderSentAT') 
BEGIN 
 ALTER TABLE MSTeamsMemberResponses ADD LastReminderSentAT  DATETIME

END 
GO 

IF (NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'filesdata'))
BEGIN
	CREATE TABLE filesdata (
	id int primary key identity(1,1),
	inc_id int,
	File_name nvarchar(200),
	File_size nvarchar(100),
	Blob nvarchar(max)
	);
END
GO


IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsMemberResponsesRecurr' AND COLUMN_NAME = 'SendRemindersCounter') 
BEGIN 
 ALTER TABLE MSTeamsMemberResponsesRecurr ADD SendRemindersCounter  int DEFAULT  0 not null

END 
GO 

IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsMemberResponsesRecurr' AND COLUMN_NAME = 'LastReminderSentAT') 
BEGIN 
 ALTER TABLE MSTeamsMemberResponsesRecurr ADD LastReminderSentAT  DATETIME

END 
GO


IF NOT EXISTS(SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'MSTeamsAssistance' AND COLUMN_NAME = 'UserLocation') 
BEGIN 
 ALTER TABLE MSTeamsAssistance ADD UserLocation  nvarchar(200)

END 
GO


