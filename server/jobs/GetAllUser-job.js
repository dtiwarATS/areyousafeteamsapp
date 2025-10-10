const axios = require("axios");
const poolPromise = require("../db/dbConn");
const qs = require("qs");
const { parentPort } = require("worker_threads");
const sql = require("mssql");

async function getAccessToken() {
  let data = new FormData();
  data.append("grant_type", "refresh_token");
  data.append("client_Id", "client_Id");
  data.append("client_secret", "client_secret");
  data.append("refresh_token", "refresh_token");
  let accessToken = "";
  let config = {
    method: "post",
    maxBodyLength: Infinity,
    url: `https://login.microsoftonline.com/881cba72-13a2-4400-bac5-c05dd4730675/oauth2/token`,
    data: data,
    // timeout: 10000,
  };
  await axios
    .request(config)
    .then(async (response) => {
      // console.log(response.data);
      if (response.data.scope?.indexOf("User.Read.All") == -1) {
        console.log(response.data.scope?.indexOf("User.Read.All"));
      } else {
        accessToken = response.data.access_token;
      }
    })
    .catch((error) => {
      console.log("error at get access token in get users phone number", error);
      // console.log(error);
    });
  return accessToken;
}

async function getAllUsers() {
  try {
    const token = await getAccessToken();

    let url =
      "https://graph.microsoft.com/v1.0/users?$select=displayName,id,department,country,city,state,mail,surname,accountEnabled&$filter=accountEnabled eq true&$top=999";
    let allUsers = [];

    while (url) {
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      allUsers = allUsers.concat(res.data.value);
      url = res.data["@odata.nextLink"] || null; // pagination
    }

    return allUsers;
  } catch (err) {
    console.log(err);
  }
}
// Batch size
const BATCH_SIZE = 500;

async function insertUsersIfNotExist(users, teamId, tenantId) {
  try {
    let pool = await poolPromise;

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);

      for (const user of batch) {
        const query = `
          IF NOT EXISTS (SELECT 1 FROM MSTeamsTeamsUsers WHERE user_aadobject_id = @user_aadobject_id)
          BEGIN
            INSERT INTO MSTeamsTeamsUsers
            (team_id, user_aadobject_id, user_name, email, userPrincipalName, tenantid, userRole, hasLicense, COUNTRY, CITY, STATE, DEPARTMENT, IS_TEAM_MEMBER)
            VALUES
            (@team_id, @user_aadobject_id, @user_name, @email, @userPrincipalName, @tenantid, @userRole, @hasLicense, @COUNTRY, @CITY, @STATE, @DEPARTMENT, @IS_TEAM_MEMBER)
          END
        `;

        await pool
          .request()
          .input("team_id", sql.NVarChar, teamId)
          .input("user_aadobject_id", sql.NVarChar, user.id)
          .input("user_name", sql.NVarChar, user.displayName)
          .input("email", sql.NVarChar, user.mail || "")
          .input(
            "userPrincipalName",
            sql.NVarChar,
            user.userPrincipalName || ""
          )
          .input("tenantid", sql.NVarChar, tenantId)
          .input("userRole", sql.NVarChar, user.userRole || "User")
          .input("hasLicense", sql.Bit, 0)
          .input("COUNTRY", sql.NVarChar, user.country || "")
          .input("CITY", sql.NVarChar, user.city || "")
          .input("STATE", sql.NVarChar, user.state || "")
          .input("DEPARTMENT", sql.NVarChar, user.department || "")
          .input("IS_TEAM_MEMBER", sql.Bit, 0)
          .query(query);
      }

      console.log(
        `✅ Processed batch ${i / BATCH_SIZE + 1} of ${Math.ceil(
          users.length / BATCH_SIZE
        )}`
      );
    }

    await pool.close();
    console.log("✅ All users inserted if not exist!");
  } catch (err) {
    console.error("DB Insert Error:", err);
  }
}

(async () => {
  try {
    await getAllUsers()
      .then(async (users) => {
        console.log(`Fetched ${users.length} users`);
        console.log(
          users.map((u) => ({
            id: u.id,
            displayName: u.displayName,
            mail: u.mail,
          }))
        );
        await insertUsersIfNotExist(
          users,
          "19:PBgn-bK-_fapsejszGEpeG9dgqnp1-RvYDenEWDOYnA1@thread.tacv2",
          "881cba72-13a2-4400-bac5-c05dd4730675"
        );
      })
      .catch((err) => console.error("Error fetching users:", err));
  } catch (err) {
    console.error(err);
    console.log(`Error in updateTeamMembers job: ${err.message}`);
    // processSafetyBotError(
    //     err,
    //     "",
    //     "",
    //     "",
    //     "Error in updateTeamMembers job"
    // );
  } finally {
    console.log("Completed updateTeamMembers job");
  }

  // Signal to parent that the job is done
  if (parentPort) parentPort.postMessage("done");
  else process.exit(0);
})();
