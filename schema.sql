
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