const path = require("path");
const express = require("express");
const Bree = require("bree");
const Graceful = require("@ladjs/graceful");
const cors = require("cors");
const poolPromise = require("./db/dbConn");
const ENV_FILE = path.join(__dirname, "../.env");
require("dotenv").config({ path: ENV_FILE });

const PORT = process.env.PORT || 3978;
const app = express();

//======================= BREE JS START ======================
//running the job every 5 minutes
function initJob(){
  const bree = new Bree({
    root: false,
    jobs: [      
      {
        name: "recurr-job",
        path: path.join(__dirname, 'jobs', 'recurr-job.js'),
        cron: "*/1 * * * *",
      },
    ],
  });
 
  const graceful = new Graceful({ brees: [bree] });
  graceful.listen();
 
  bree.start();
} 
//initJob();
//======================= BREE JS END ========================

const closeConnectionPool = async () => {
  const pool = await poolPromise;
  if (pool) {
    return pool.close();
  }
  return Promise.resolve();
};

app.use(cors());
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use("/api", require("./api"));

app.get("/", (req, res) => {
  res.send(
    `<h2>The Are You Safe app is running</h2>
    <p>Follow the instructions in the README to configure the Microsoft Teams App and your environment variables.</p>`
  );
});

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);

function shutDown() {
  console.log("Closing server...");
  server.close(() => {
    console.log("Server closed successfully");
    // close SQL connection pool
    closeConnectionPool().then(() => {
      console.log(`SQL Connection Pool closed successfully`);
    });
  });
}

const {
  TeamsInfo,
  TurnContext,
  MessageFactory,
  CardFactory,
} = require("botbuilder");
const { ConnectorClient, MicrosoftAppCredentials } = require('botframework-connector');
const sendProactiveMessaage = async () => { 

  let resp = null;
  try{
    const conversationParameters = {
      isGroup: false,      
      channelData: {
        tenant: {
          id: process.env.tenantId
        }
      },
      bot: {
        id: process.env.MicrosoftAppId,
        name: process.env.BotName
      },
      members: [
        {
          id: "29:1_L-WaxLz0UJP3xkgQyCFQKX9xSgGD41LnC6qNG-GcvDx7JmSoB6g5SQN5U-rRXqy9jc2XKrLQ9rYUOxNw7GJXw"         
        }        
      ]    
    };
  
    let activity = MessageFactory.text("test sandesh");;
    
    
    if(activity != null){
      var credentials = new MicrosoftAppCredentials(process.env.MicrosoftAppId, process.env.MicrosoftAppPassword);
      var connectorClient = new ConnectorClient(credentials, { baseUri: process.env.serviceUrl });
      
      const response = await connectorClient.conversations.createConversation(conversationParameters);                  
      const resp = await connectorClient.conversations.sendToConversation(response.id, activity);
      var a = 10;
    }    
  }
  catch(err)
  {
    console.log(err);
  }  
}
sendProactiveMessaage();