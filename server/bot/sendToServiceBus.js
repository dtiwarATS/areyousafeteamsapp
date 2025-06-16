const { ServiceBusClient } = require("@azure/service-bus");
require("dotenv").config();

// Replace with your connection string and queue name
const connectionString = process.env.SERVICE_BUS_CONNECTION_STRING;
const queueName = process.env.SERVICE_BUS_QUEUE_NAME;

const sendMessageToServiceBus = async (messagePayload, maxRetries = 3) => {
  let attempt = 0;
  let delay = 1000;
  while (attempt < maxRetries) {
    const sbClient = new ServiceBusClient(connectionString);
    const sender = sbClient.createSender(queueName);

    try {
      const message = {
        body: messagePayload,
        contentType: "application/json",
        label: "BotMessage",
      };

      console.log(`Sending message (attempt ${attempt + 1}):`, message.body);
      await sender.sendMessages(message);

      console.log("Message sent successfully.");
      await sender.close();
      await sbClient.close();
      return true;
    } catch (err) {
      attempt++;
      console.error(`Error sending message (attempt ${attempt}):`, err.message);

      await sender.close();
      await sbClient.close();

      if (attempt >= maxRetries) {
        console.error("Max retry attempts reached. Giving up.");
        return false;
      }

      // Exponential backoff with jitter
      const jitter = Math.floor(Math.random() * 500);
      await new Promise((res) => setTimeout(res, delay + jitter));
      delay *= 2;
    }
  }
};

module.exports = { sendMessageToServiceBus };
