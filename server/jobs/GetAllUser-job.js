const axios = require("axios");
const poolPromise = require("../db/dbConn");
const qs = require("qs");
const { parentPort } = require("worker_threads");
const sql = require("mssql");
const tenantId = "b9328432-f501-493e-b7f4-3105520a1cd4";
const clientId = "4ccb45d1-2f4a-4010-8899-d9189b9ff86a";
const clientSecret = "2RV8Q~eQAFyGFzJMElKob0fjNf6MBgqwtWq5lcb1";

async function getAccessToken() {
  let data = new FormData();
  data.append("grant_type", "refresh_token");
  data.append("client_Id", "f1739c01-2e62-404b-80d4-72f79582ba0f");
  data.append("client_secret", "Zsh8Q~pfaxvh6PSXOBWZ8FRMmajhs7WGcdYQJcKX");
  data.append(
    "refresh_token",
    "1.AUoAcrociKITAES6xcBd1HMGdQGcc_FiLktAgNRy95WCug-JAJpKAA.BQABAwEAAAADAOz_BQD0_ySXb6AQbxjpa9LMfjvPdlf0kzaZ6QHmrO1685mAP2TdAHJqLut2j1ki7F6F_d97gArV1OwZY5sFNU7BhlaSg5lS4IFzh82rh3lAb2ZE3VPWKaX-ppGbFqhMGH0Yhh24ohTpYiOYdmVwQvJe_3omzqvkRurpNFvbIMv6rp2IrSkPNBzKkrd6U_tdCSSYL7xeYwSpehKc8J6dr9NfOG10RqA4AOWZeO5TyRMwj34ywDtTDUHImRxXTX2IC7MFItKvK-o600pg9upWwwv6A5EepfVCjYU-nVLYab3m57-KhuejdNe88SHPhAdya6VvzAGLtI1pI5gW-0vjIxkRFv63j7ZowWMn2_J07UNJNvrKjJFqDEiTnX0Fo8UxWmqkfpr-QiCnyCJTIjtK78GgQTWs_PjKytzQDQuR6tiQd_0k-BIj_RPWn0V8apaBKVKhWvqmHJi7AkJlhVUQ6xVtHFCFzuKBLpr7JFPFEwzc_Jb-XHwXJIVCgr3BQR0RszuAxhAlSPQa3exVaPjZvNgXmptiW-_Y5gGTE8UJmtvnTX58A-ibOz6RyY1sv1LrLTmz7BisCjkphLrHHt7mV9oSXD_LyNU21VHvhOu-X1kmjvJl5RPObhKY5QpC-E9k_Q8sgfL9NlYm6v5-5Rh1dkIjWZ9B777I1qrf_zZO5bStn39bIpwBHpJwcrJFjVFmsiFrWQv6MQy4QQge20wlYEMt0OXlDFc19iHqg7lswntjLWn5r7pO69saib1sCh2lnB9FXs6CLG2fTQJJxotLS2ahzaZANi4QfLtfB2vl-5Zk6Ep0cMH5qaRT_6FIM_xN-UU2-UGOcJunELT7iM4wnX7SmR2xPROfWkuJX8DZrcN-dncB_HwsgJPudfBaICIg9ydKK5OnX3B75KylmtDYdFAUcjZ3kZzdK7m8S9chLlTI5P0WyXDDG0zMV-FzekkVonxAhX6OfVXv5lY7ZLigPvXorZaK-kQLSBcLwDfHyJslFjorOxILkKYQ0E-8sralBkUOBi9MIs-HXI8Vys6ehf0irB-nP8geqbmKBgv4mS0xqagXx-2jAob-K8QLMXnVNisy-O1EeQe0dEJGoFPOAMqnoo5cCtiWCYDyI2gmFp7G44p6Pr6oKRlaJRKXXclfA7hIbb7GH0VKlEnCnQ7K3Pongx8oSz4RC5_2A3N1aOr1Ju4dl5jMvPxYzBBDrFkUweBV4IlPw9XvxSdk2c7e9oZFwVkzdlOf7oEZ3xnKEI7SrMozMHq9NcMRCvhMhPosJ32c4hasWtel6R5ZFdGDefF8RsE5h4nDXVO3xgmWom_EA8mGuFqBYTqfvPakjBU8TfdjCI3QoeNnQV1-LWJ-AnxFQ0ChNr6se3xv4DOMb3APb2ixN5BX8yoE3QEFoZ-fFxkeaZqSEvFAOKqblj_tO-JsiWajZdiubKNiXosXBb8wOGBTnA"
  );
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
