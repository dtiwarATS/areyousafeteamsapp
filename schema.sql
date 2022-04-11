
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
	inc_name VARCHAR(255) NOT NULL,
	inc_desc VARCHAR(max) DEFAULT NULL,
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
	timestamp VARCHAR(100),
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
ALTER TABLE MSTeamsIncidents ADD CREATED_BY_NAME NVARCHAR(50) NULL
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