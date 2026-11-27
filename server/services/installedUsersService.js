const { getActivePoolPromise } = require("../db/dbContext");
const apimeth = require("../api/apiMethods");

const toSqlNVarChar = (value) => `N'${String(value).replace(/'/g, "''")}'`;

const toSqlNVarCharOrNull = (value) => {
  if (value === null || value === undefined) return "NULL";
  const str = String(value);
  if (str.length === 0) return "NULL";
  return toSqlNVarChar(str);
};

const hasConversationId = (conversationId) =>
  conversationId !== null &&
  conversationId !== undefined &&
  String(conversationId).toLowerCase() !== "null" &&
  String(conversationId).length > 0;

const getKey = (team, aad) => `${team}::${aad}`;

/**
 * Insert installed users and fill conversationId only when the row does not
 * already have one. Shared by the Check Deployment route and the hourly sync.
 */
const saveInstalledUsers = async (users, tenantId, teamId, botServiceUrl) => {
  if (!users || !Array.isArray(users) || users.length === 0) {
    return {
      success: false,
      error: "No users provided or users array is empty",
    };
  }

  if (!tenantId) {
    return {
      success: false,
      error: "Tenant ID is required",
    };
  }

  const pool = await getActivePoolPromise();

  const normalized = users.map((user, index) => {
    const userTeamId = user.team_id || user.teamId || teamId;
    const userAadObjectId =
      user.aadObjectId ||
      user.objectId ||
      user.aadUserId ||
      user.user_aadobject_id;
    const userId = user.user_id || user.userId || user.id || userAadObjectId;
    const userName =
      user.user_name ||
      user.userName ||
      user.displayName ||
      user.name ||
      user.username ||
      "";
    const userPrincipalName =
      user.userPrincipalName || user.user_principal_name || user.upn || "";
    const email = user.email || user.mail || "";
    const userRole = user.userRole || user.user_role || user.role || "User";
    const isTeamMember =
      user.IS_TEAM_MEMBER !== undefined
        ? user.IS_TEAM_MEMBER
        : user.isTeamMember !== undefined
          ? user.isTeamMember
          : 1;

    const isValid = Boolean(userTeamId && userAadObjectId);
    return {
      index,
      original: user,
      isValid,
      team_id: userTeamId,
      user_aadobject_id: userAadObjectId,
      user_id: userId,
      user_name: userName,
      userPrincipalName,
      email,
      tenantid: tenantId,
      userRole,
      IS_TEAM_MEMBER: isTeamMember ? 1 : 0,
      hasLicense: 0,
      conversationId: null,
      conversation: false,
    };
  });

  let skippedCount = 0;
  for (const u of normalized) {
    if (!u.isValid) skippedCount++;
  }

  const validUsers = normalized.filter((u) => u.isValid);
  if (validUsers.length === 0) {
    return {
      success: false,
      error: "No valid users to save after validation",
      skippedCount,
      totalUsers: users.length,
    };
  }

  const keysValuesClause = validUsers
    .map(
      (u) =>
        `(${toSqlNVarChar(u.team_id)}, ${toSqlNVarChar(u.user_aadobject_id)})`,
    )
    .join(",\n    ");

  const precheckQuery = `
        SELECT
          source.team_id,
          source.user_aadobject_id,
          existing.conversationId
        FROM (VALUES
          ${keysValuesClause}
        ) AS source (team_id, user_aadobject_id)
        LEFT JOIN MSTeamsTeamsUsers AS existing
          ON existing.team_id = source.team_id
         AND existing.user_aadobject_id = source.user_aadobject_id;
      `;

  const precheckResult = await pool.request().query(precheckQuery);
  const existingConversationMap = new Map();
  for (const row of precheckResult.recordset || []) {
    existingConversationMap.set(
      getKey(row.team_id, row.user_aadobject_id),
      row.conversationId,
    );
  }

  let alreadyHadConversationCount = 0;
  for (const u of validUsers) {
    const existingConversationId = existingConversationMap.get(
      getKey(u.team_id, u.user_aadobject_id),
    );
    if (hasConversationId(existingConversationId)) {
      u.conversationId = existingConversationId;
      u.conversation = true;
      alreadyHadConversationCount++;
    }
  }

  let createdConversationCount = 0;
  for (const u of validUsers) {
    if (u.conversation) continue;

    const newConversationId = await apimeth.getUsersConversationId(
      tenantId,
      [
        {
          id: u.user_aadobject_id,
          name: u.user_name,
        },
      ],
      botServiceUrl,
      u.user_aadobject_id,
    );

    console.log("Conversation ID fetch result:", {
      userName: u.user_name,
      conversationId: newConversationId,
    });

    if (hasConversationId(newConversationId)) {
      u.conversationId = newConversationId;
      u.conversation = true;
      createdConversationCount++;
    }
  }

  const upsertValuesClause = validUsers
    .map((u) => {
      return `(
          ${toSqlNVarChar(u.team_id)},
          ${toSqlNVarChar(u.user_aadobject_id)},
          ${toSqlNVarCharOrNull(u.user_id)},
          ${toSqlNVarCharOrNull(u.user_name)},
          ${toSqlNVarCharOrNull(u.userPrincipalName)},
          ${toSqlNVarCharOrNull(u.email)},
          ${toSqlNVarCharOrNull(u.tenantid)},
          ${toSqlNVarCharOrNull(u.userRole)},
          ${u.IS_TEAM_MEMBER},
          ${toSqlNVarCharOrNull(u.conversationId)},
          ${u.hasLicense}
        )`;
    })
    .join(",\n    ");

  const mergeQuery = `
        MERGE INTO MSTeamsTeamsUsers WITH (HOLDLOCK) AS target
        USING (VALUES
          ${upsertValuesClause}
        ) AS source
        (
          team_id, user_aadobject_id, user_id, user_name, userPrincipalName, email, tenantid, userRole, IS_TEAM_MEMBER, conversationId, hasLicense
        )
        ON target.team_id = source.team_id
       AND target.user_aadobject_id = source.user_aadobject_id
        WHEN MATCHED THEN
          UPDATE SET
            user_id = source.user_id,
            user_name = source.user_name,
            userPrincipalName = source.userPrincipalName,
            email = source.email,
            tenantid = source.tenantid,
            userRole = source.userRole,
            IS_TEAM_MEMBER = source.IS_TEAM_MEMBER,
            conversationId = CASE
              WHEN (target.conversationId IS NULL OR target.conversationId = 'null')
               AND (source.conversationId IS NOT NULL AND source.conversationId <> 'null')
              THEN source.conversationId
              ELSE target.conversationId
            END
        WHEN NOT MATCHED THEN
          INSERT (team_id, user_aadobject_id, user_id, user_name, userPrincipalName, email, tenantid, userRole, IS_TEAM_MEMBER, conversationId, hasLicense)
          VALUES (source.team_id, source.user_aadobject_id, source.user_id, source.user_name, source.userPrincipalName, source.email, source.tenantid, source.userRole, source.IS_TEAM_MEMBER, source.conversationId, source.hasLicense);
      `;

  const mergeResult = await pool.request().query(mergeQuery);

  const usersWithConversationFlag = normalized.map((u) => ({
    ...u.original,
    conversation: Boolean(u.conversation),
  }));

  console.log(
    `✅ Processed ${users.length} users. valid=${validUsers.length}, skipped=${skippedCount}, alreadyHadConversation=${alreadyHadConversationCount}, createdConversation=${createdConversationCount}`,
  );

  return {
    success: true,
    message: `Processed ${users.length} users`,
    totalUsers: users.length,
    validCount: validUsers.length,
    skippedCount,
    alreadyHadConversationCount,
    createdConversationCount,
    dbRowsAffected: mergeResult?.rowsAffected,
    users: usersWithConversationFlag,
  };
};

module.exports = {
  saveInstalledUsers,
};
