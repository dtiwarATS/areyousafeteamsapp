const { getMobileDashboardMsgBlockJSON } = require("../models/UpdateCards");

const getOldWelcomeMessageCard = () => {
  // return {
  //   $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
  //   type: "AdaptiveCard",
  //   version: "1.0",
  //   body: [
  //     {
  //       type: "TextBlock",
  //       text: `👋 Hello! Are you safe? allows you to trigger a safety check during a crisis. All users will get a direct message asking them to mark themselves safe.
  //       \r\nIdeal for Safety admins and HR personnel to setup and use during emergency situations.`,
  //       wrap: true
  //     },
  //     {
  //       type: "TextBlock",
  //       text: "You do not need any other software or service to use this app."
  //     },
  //     {
  //       type: "TextBlock",
  //       text: "Enter 'Hi' to start a conversation with the bot."
  //     },
  //     {
  //       type: "TextBlock",
  //       text: "If you need any help or want to share feedback, feel free to reach out to my makers at [help@safetycheck.in](mailto:help@safetycheck.in)",
  //       wrap: true
  //     }
  //   ]
  // };
};

const subscriptionLink =
  "https://teams.microsoft.com/l/app/884e521a-dadc-41e9-a8af-fcaa907e783e?source=app-details-dialog";

const subcriptionLinkJSON = {
  type: "TextBlock",
  text: `If you wish to subscribe to **Safety Check bot** premium, please [Click Here](${subscriptionLink}).`,
  wrap: true,
};

const contactUsActionObj = {
  type: "Action.OpenUrl",
  title: "Contact us",
  url: "mailto:help@safetycheck.in",
  id: "contactUsAction",
};
const getContactUsBtnJSON = () => {
  return {
    type: "ActionSet",
    actions: [contactUsActionObj],
  };
};

const faqActionObj = {
  type: "Action.OpenUrl",
  title: "Frequently Asked Questions",
  url: "https://safetycheck.in/#faq",
  iconUrl:
    "data:image/png;base64,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",
  id: "faqAction",
};

const getFAQBtnJSON = () => {
  return {
    type: "ActionSet",
    actions: [faqActionObj],
  };
};

const getManageLicenseActionObj = (userEmailId) => {
  return {
    type: "Action.OpenUrl",
    title: "Manage Licenses",
    url: `https://areyousafesubscriptionpage.azurewebsites.net/?isFromSafetyBot=true&emailid=${userEmailId}`,
    iconUrl:
      "data:image/png;base64,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",
    id: "manageLicenseAction",
  };
};
const getManageLicenseBtnJSON = (userEmailId) => {
  return {
    type: "ActionSet",
    actions: [getManageLicenseActionObj(userEmailId)],
  };
};

const getFaqAndContactUsColumnSetJSON = () => {
  const faqBtnJSON = getFAQBtnJSON();
  const contactUsBtnJSON = getContactUsBtnJSON();
  return {
    type: "ColumnSet",
    columns: [
      {
        type: "Column",
        width: "auto",
        items: [faqBtnJSON],
      },
      {
        type: "Column",
        width: "auto",
        items: [contactUsBtnJSON],
        verticalContentAlignment: "Center",
      },
    ],
  };
};

const getManageLicenseColumnSet = (userEmailId) => {
  const manageLicenseBtnJSON = getManageLicenseBtnJSON(userEmailId);
  return {
    type: "ColumnSet",
    columns: [
      {
        type: "Column",
        width: "auto",
        items: [manageLicenseBtnJSON],
      },
    ],
  };
};

const getHelpActionSet = (teamMemberCount, userEmailId) => {
  const manageLicenseActionObj = getManageLicenseActionObj(userEmailId);

  const actionArr = [faqActionObj];
  if (teamMemberCount > 10) {
    actionArr.push(manageLicenseActionObj);
  }
  actionArr.push(contactUsActionObj);
  return actionArr;
};

const getWelcomeMessageCard = (teamMemberCount, teamName) => {
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.5",
    body: [
      {
        type: "TextBlock",
        text: `Welcome to the Safety Check bot! I will help you communicate with your team during a crisis.`,
        wrap: true,
      },
    ],
  };
};
const getWelcomeMessageCardformpersonal = (teamname) => {
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.5",
    body: [
      {
        type: "TextBlock",
        text: `**Welcome to Safety Check!**\n
You’re now linked to **${teamname}**, where the app was originally installed.\n 
You can use the **Dashboard** tab to trigger **SOS alerts** and stay connected to the team during emergencies.`,
        wrap: true,
      },
    ],
  };
};
const getWelcomeMessageCard2 = (teamMemberCount, teamName) => {
  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.5",
    body: [
      {
        type: "TextBlock",
        text: "To get started, I can help you create a sample Safety Check and add it to your Dashboard after it gets created. I can reach out to your team members and send them the sample Safety Check.",
        //`To get started, let's send out a test safety check message to team - **${teamName}** (${teamMemberCount} members) through a direct message.`,
        wrap: true,
      },
    ],
  };
};

const getTestIncPreviewCard = (teamMemberCount, companyData) => {
  const userEmailId = companyData.userEmailId;
  const helpActionSet = getHelpActionSet(teamMemberCount, userEmailId);
  const safetyCheckMessageText = `This is a safety check from <at>${companyData.userName}</at>. We think you may be affected by **Sample Drill**. Mark yourself as safe, or ask for assistance.`;
  const body = [
    {
      type: "TextBlock",
      text: "The sample message will look like this:",
    },
    {
      type: "TextBlock",
      size: "Large",
      weight: "Bolder",
      text: "Hello!",
    },
    {
      type: "TextBlock",
      text: " ",
      separator: true,
      wrap: true,
    },
    {
      type: "TextBlock",
      wrap: true,
      text: safetyCheckMessageText,
    },
    {
      type: "ActionSet",
      actions: [
        {
          type: "Action.Execute",
          title: "I am safe",
        },
        {
          type: "Action.Execute",
          title: "I need assistance",
        },
      ],
    },
    {
      type: "TextBlock",
      separator: true,
      text: " ",
      wrap: true,
    },
    // {
    //   type: "TextBlock",
    //   wrap: true,
    //   separator: true,
    //   text: `Click on **Continue** to send this message to everyone.`,
    // },
    {
      type: "ColumnSet",
      columns: [
        {
          type: "Column",
          width: "auto",
          items: [
            {
              type: "ActionSet",
              actions: [
                {
                  type: "Action.Execute",
                  title: "Go Ahead",
                  verb: "triggerTestSafetyCheckMessage",
                  style: "positive",
                  data: {
                    companyData,
                    teamMemberCount,
                  },
                },
              ],
            },
          ],
        },
        //
        {
          type: "Column",
          width: "auto",
          items: [
            {
              type: "ActionSet",
              actions: [
                {
                  type: "Action.Execute",
                  title: "Do It Later",
                  verb: "do_it_later",
                  style: "positive",
                  data: {
                    companyData,
                    teamMemberCount,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "TextBlock",
      text: " ",
      separator: true,
      wrap: true,
    },
    {
      type: "TextBlock",
      text: "Have questions or want a quick demo?",
    },
    {
      type: "TextBlock",
      text: "[Email](mailto:Neha.pingale@safetycheck.in) | [Chat](https://teams.microsoft.com/l/chat/0/0?users=safetycheck@ats360.com) | [Schedule Call](https://calendly.com/nehapingale/short-call)",
    },
  ];

  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.5",
    body,
    msteams: {
      entities: [
        {
          type: "mention",
          text: `<at>${companyData.userName}</at>`,
          mentioned: {
            id: companyData.userId,
            name: companyData.userName,
          },
        },
      ],
    },
  };
};

//////remender card

const getTestIncPreviewCard1 = (teamMemberCount, companyData) => {
  const userEmailId = companyData.userEmailId;
  const helpActionSet = getHelpActionSet(teamMemberCount, userEmailId);
  const safetyCheckMessageText = `This is a safety check from <at>${companyData.userName}</at>. We think you may be affected by **Sample Drill**. Mark yourself as safe, or ask for assistance.`;
  const body = [
    {
      type: "TextBlock",
      text: "Hi! Would you like me to reach out to your team members and send the sample safety check message to them?",
      wrap: true,
    },
    {
      type: "TextBlock",
      size: "Large",
      weight: "Bolder",
      text: "Hello!",
    },
    {
      type: "TextBlock",
      text: " ",
      separator: true,
      wrap: true,
    },
    {
      type: "TextBlock",
      wrap: true,
      text: safetyCheckMessageText,
    },
    {
      type: "ActionSet",
      actions: [
        {
          type: "Action.ToggleVisibility",
          title: "I am safe",
          targetElements: [],
        },
        {
          type: "Action.ToggleVisibility",
          title: "I need assistance",
          targetElements: [],
        },
      ],
    },
    {
      type: "TextBlock",
      separator: true,
      text: " ",
      wrap: true,
    },
    // {
    //   type: "TextBlock",
    //   wrap: true,
    //   separator: true,
    //   text: `Click on **Continue** to send this message to everyone.`,
    // },
    {
      type: "ColumnSet",
      columns: [
        {
          type: "Column",
          width: "auto",
          items: [
            {
              type: "ActionSet",
              actions: [
                {
                  type: "Action.Execute",
                  title: "Go Ahead",
                  verb: "triggerTestSafetyCheckMessage",
                  style: "positive",
                  data: {
                    companyData,
                    teamMemberCount,
                  },
                },
              ],
            },
          ],
        },
        //
        {
          type: "Column",
          width: "auto",
          items: [
            {
              type: "ActionSet",
              actions: [
                {
                  type: "Action.Execute",
                  title: "Do It Later",
                  verb: "do_it_later",
                  style: "positive",
                  data: {
                    companyData,
                    teamMemberCount,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "TextBlock",
      text: " ",
      separator: true,
      wrap: true,
    },
    {
      type: "TextBlock",
      text: "Have questions or want a quick demo?",
    },
    {
      type: "TextBlock",
      text: "[Email](mailto:Neha.pingale@safetycheck.in) | [Chat](https://teams.microsoft.com/l/chat/0/0?users=safetycheck@ats360.com) | [Schedule Call](https://calendly.com/nehapingale/short-call)",
    },
  ];

  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.5",
    body,
    msteams: {
      entities: [
        {
          type: "mention",
          text: `<at>${companyData.userName}</at>`,
          mentioned: {
            id: companyData.userId,
            name: companyData.userName,
          },
        },
      ],
    },
  };
};

const getWelcomeMessageCardOld = (
  teamMemberCount,
  companyData,
  teamName,
  newInc
) => {
  const userEmailId = companyData.userEmailId;

  let btnSafe = {
    type: "Action.ShowCard",
    title: "I am safe",
    isEnabled: false,
  };
  let btnAssistance = {
    type: "Action.ShowCard",
    title: "I need assistance",
    isEnabled: false,
  };
  const helpActionSet = getHelpActionSet(teamMemberCount, userEmailId);
  const safetyCheckMessageText = `This is a **${newInc.incTitle}** from <at>${newInc.incCreatedByName}</at>. Please click any of the buttons below to help them test the bot.`;
  const body = [
    {
      type: "TextBlock",
      text: `Welcome to the Safety Check bot! I will help you communicate with your team during a crisis.`,
      wrap: true,
    },
    // {
    //     "type": "TextBlock",
    //     "text": `I will help you communicate with your team during a crisis.`,
    //     "wrap": true,
    //     "spacing": "None",
    // },
    {
      type: "TextBlock",
      text: "To get started, I have created a sample Safety Check and added it to your Dashboard. I can reach out to your team members and send them the sample Safety Check.",
      //`To get started, let's send out a test safety check message to team - **${teamName}** (${teamMemberCount} members) through a direct message.`,
      wrap: true,
    },
    {
      type: "TextBlock",
      text: "Here is how the message will look to your team members:",
      wrap: true,
    },
    {
      type: "TextBlock",
      text: " ",
      separator: true,
      wrap: true,
    },
    {
      type: "TextBlock",
      wrap: true,
      text: safetyCheckMessageText,
    },
    // {
    //     "type": "ColumnSet",
    //     "columns": [
    //         {
    //             "type": "Column",
    //             "width": "auto",
    //             "items": [
    //                 {
    //                     "type": "TextBlock",
    //                     "text": "I am safe",
    //                     "wrap": true,
    //                     "size": "Large",
    //                     "weight": "Lighter",
    //                     "color": "Accent"
    //                 }
    //             ],
    //             "style": "emphasis"
    //         },
    //         {
    //             "type": "Column",
    //             "width": "auto",
    //             "items": [
    //                 {
    //                     "type": "TextBlock",
    //                     "text": "I need assistance",
    //                     "wrap": true,
    //                     "size": "Large",
    //                     "color": "Accent"
    //                 }
    //             ],
    //             "style": "emphasis"
    //         }
    //     ]
    // },
    // {
    //     type: "ActionSet",
    //     actions: [
    //         btnSafe,
    //         btnAssistance
    //     ]
    // },
    {
      type: "ActionSet",
      actions: [
        {
          type: "Action.ToggleVisibility",
          title: "I am safe",
          targetElements: [],
        },
        {
          type: "Action.ToggleVisibility",
          title: "I need assistance",
          targetElements: [],
        },
      ],
    },
    {
      type: "TextBlock",
      text: " ",
      wrap: true,
    },
    {
      type: "TextBlock",
      wrap: true,
      separator: true,
      text: `Click on **Continue** to send this message to everyone.`,
    },
    {
      type: "ColumnSet",
      columns: [
        {
          type: "Column",
          width: "auto",
          items: [
            {
              type: "ActionSet",
              actions: [
                {
                  type: "Action.Execute",
                  title: "Continue",
                  verb: "triggerTestSafetyCheckMessage",
                  style: "positive",
                  data: {
                    inc: newInc,
                    companyData: companyData,
                  },
                },
              ],
            },
          ],
        },
        {
          type: "Column",
          width: "stretch",
          items: [
            {
              type: "ActionSet",
              actions: [
                {
                  type: "Action.ToggleVisibility",
                  title: "Help",
                  targetElements: ["helpActionSetToggle"],
                },
              ],
            },
            {
              type: "ActionSet",
              isVisible: false,
              id: "helpActionSetToggle",
              actions: helpActionSet,
            },
          ],
        },
      ],
    },
  ];

  return {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.5",
    body,
    msteams: {
      entities: [
        {
          type: "mention",
          text: `<at>${companyData.userName}</at>`,
          mentioned: {
            id: companyData.userId,
            name: companyData.userName,
          },
        },
      ],
    },
  };
};

const getSubcriptionSelectionCard = (
  teamMemberCount,
  userEmail,
  companyData
) => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `I can see that you have ${teamMemberCount} users in your team. Safety Check bot FREE version will work for up to 10 users. Alternatively, you can start your 45-day free trial of the premium version and get Safety Check bot access for unlimited users.`,
        wrap: true,
      },
      {
        type: "ActionSet",
        actions: [
          {
            type: "Action.Execute",
            title: "Continue with the free version (10 users)",
            verb: "newUsrSubscriptionType1",
            data: {
              userEmail,
              companyData,
            },
          },
        ],
      },
      {
        type: "ActionSet",
        actions: [
          {
            type: "Action.Execute",
            title:
              "Start a 45-day free trial of premium version (unlimited users)",
            verb: "newUsrSubscriptionType2",
            data: {
              userEmail,
              companyData,
            },
          },
        ],
      },
    ],
  };
};

const getHelfullLinkJSON = (userEmailId) => {
  const faqAndContactUsColumnSetJSON = getFaqAndContactUsColumnSetJSON();
  const manageLicenseColumnSet = getManageLicenseColumnSet(userEmailId);
  return [
    {
      type: "TextBlock",
      text: "Helpful links",
      wrap: true,
      separator: true,
    },
    faqAndContactUsColumnSetJSON,
    manageLicenseColumnSet,
  ];
};

const getAfterUsrSubscribedTypeOneCard = (userEmailId, companyData) => {
  const helfullLinkJSON = getHelfullLinkJSON(userEmailId);
  const mobileDashboardMsgBlockJSON =
    getMobileDashboardMsgBlockJSON(companyData);
  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.0",
    body: [
      {
        type: "TextBlock",
        text: "Hello! Click on the **Dashboard tab** above to access all features.",
        wrap: true,
      },
      mobileDashboardMsgBlockJSON,
      ...helfullLinkJSON,
    ],
  };
  return card;
};

const getAfterUsrSubscribedTypeTwoCard = (userName, companyData) => {
  let { teamName, channelName } = companyData;
  if (teamName == null) {
    teamName = "";
  }
  if (channelName == null) {
    channelName = "General";
  }
  const currentDate = new Date();
  currentDate.setDate(currentDate.getDate() + 45);
  const faqAndContactUsColumnSetJSON = getFaqAndContactUsColumnSetJSON();
  const card = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.0",
    body: [
      {
        type: "TextBlock",
        text: `**Hello ${userName}, your Safety Check bot Premium 45-day free trial is activated and expires on ${currentDate.toLocaleDateString()}!**`,
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Click on the **Dashboard tab** above to access all features.",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: `For mobile, navigate to the  **${teamName}** team -> **${channelName}** channel -> **Safety Check** tab`,
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Helpful links",
        wrap: true,
        separator: true,
      },
      faqAndContactUsColumnSetJSON,
    ],
  };
  return card;
};

const getTypeTwoFiveDayBeforeCard = (expiryDate) => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `**Hello, Your 45-day free trial of the Safety Check bot premium version is about to expire on ${expiryDate}**. After the trial has ended, you will be on the free version. Safety Check bot will work for 10 users.`,
        wrap: true,
      },
      subcriptionLinkJSON,
    ],
  };
};

// const getTypeTwoSubscriptionEndCard = (expiryDate, userEmailId) => {
//     const helfullLinkJSON = getHelfullLinkJSON(userEmailId);
//     return {
//         "type": "AdaptiveCard",
//         "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
//         "version": "1.4",
//         "body": [
//             {
//                 "type": "TextBlock",
//                 "text": `**Hello, Your 45-day free trial of the AreYouSafe? bot premium version has ended on ${expiryDate}.** You are now on the free version. AreYouSafe? bot will work for 10 users.`,
//                 "wrap": true
//             },
//             subcriptionLinkJSON,
//             ...helfullLinkJSON
//         ]
//     }
// }

const getTypeThreeSubscriptionStartedCard = (
  userCount,
  startDate,
  endDate,
  userObj
) => {
  const mentionUserEntities = [
    {
      type: "mention",
      text: `<at>${userObj.name}</at>`,
      mentioned: userObj,
    },
  ];
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `Hello, <at>${userObj.name}</at>`,
        wrap: true,
      },
      {
        type: "TextBlock",
        text: `Your Safety Check bot **premium subscription is activated on ${startDate} for ${userCount} users** and expires on ${endDate}! `,
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Type **Help** in your chat window If you are not sure of what to do next",
        wrap: true,
      },
    ],
    msteams: {
      entities: mentionUserEntities,
    },
  };
};

const getTypeThreeFiveDayBeforeOneTimePaymentCard = (userCount, expiryDate) => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `**Your Safety Check bot monthly premium subscription for ${userCount} users is about to expire on ${expiryDate}!**`,
        wrap: true,
      },
      subcriptionLinkJSON,
    ],
  };
};

const getTypeThreeFiveDayBeforeRecurringPaymentCard = (
  userCount,
  expiryDate
) => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `**Your Safety Check bot monthly premium subscription for ${userCount} users is about to expire on ${expiryDate}!** After that, your credit card will be charged $0.5 per user/month to continue the Safety Check bot premium version.                `,
        wrap: true,
      },
      subcriptionLinkJSON,
      {
        type: "ActionSet",
        actions: [
          {
            type: "Action.Execute",
            title: "I want to cancel my subscription",
            verb: "cancelRecurringPaymentSubcription",
          },
        ],
      },
    ],
  };
};

const getCancelRecurringSubcriptionStepCard = () => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: "Follow these steps to cancel your subscription",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "1. Log in with the Microsoft account you have used to purchase your subscription \n2. Click Here and click on the **Buy a subscription** button \n3. Click on the **Manage subscriptions** link \n4. You will be navigated to the Microsoft 365 admin center page >> Under the Subscription status, Click on the **Cancel Subscription** link",
        wrap: true,
      },
    ],
  };
};

const getTypeThreeSubscriptionEndCard = (expiryDate, userEmailId) => {
  const helfullLinkJSON = getHelfullLinkJSON(userEmailId);
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `**Your Safety Check bot premium subscription has ended on ${expiryDate}.** You are now on the free version. Safety Check bot will work for 10 users.`,
        wrap: true,
      },
      subcriptionLinkJSON,
      ...helfullLinkJSON,
    ],
  };
};

const getTypeTwoSevenDayBeforeCard = (userId, userName) => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `Hi <at>${userName}</at>`,
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Your Safety Check free trial ends in 7-days. When your trial expires, we will switch you to the Free version that works for a team of up to 10 users.",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Please **Buy a subscription** to continue reaching out to all your employees during emergencies with the Safety Check bot.",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Have questions about pricing? Access our ↗ [FAQ page](https://safetycheck.in/#faq)",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "To Buy a subscription: ",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "1. Go to Apps -> Search safety check -> Click Safety Check search result and click the **Buy a subscription** button.\r\r2. On the Choose a plan page, select the monthly plan -> Click the **Checkout** button -> Update the quantity equal to your team size -> Enter a payment method -> Click the **Place Order** button\r",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Best,\n\nTeam Safety Check",
        wrap: true,
      },
    ],
    msteams: {
      entities: [
        {
          type: "mention",
          text: `<at>${userName}</at>`,
          mentioned: {
            id: userId,
            name: userName,
          },
        },
      ],
    },
  };
};

const getTypeTwoThreeDayBeforeCard = (userId, userName) => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `Hi <at>${userName}</at>`,
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Your unlimited trial ends in 3 days.",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Without an **upgrade to premium**, you won't be able to reach all employees during emergencies using the Safety Check bot. Our plan starts at $0.50 user/month.",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Need to extend your trial? [Contact Us](mailto:help@safetycheck.in)",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "To get a premium subscription: ",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "1. Go to Apps -> Search safety check -> Click Safety Check search result and click the **Buy a subscription** button.\r\r2. On the Choose a plan page, select the monthly plan -> Click the **Checkout** button -> Update the quantity equal to your team size -> Enter a payment method -> Click the **Place Order** button\r",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Best,\n\nTeam Safety Check",
        wrap: true,
      },
    ],
    msteams: {
      entities: [
        {
          type: "mention",
          text: `<at>${userName}</at>`,
          mentioned: {
            id: userId,
            name: userName,
          },
        },
      ],
    },
  };
};

const getTypeTwoSubscriptionEndCard = (userId, userName, teamName) => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: `Hi <at>${userName}</at>`,
        wrap: true,
      },
      {
        type: "TextBlock",
        text: `Your free trial has ended. You are now on the free version. Safety Check bot will work for up to 10 users (in alphabetical order by the first name) of your team ${teamName}.`,
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Upgrade to our premium subscription plan to continue improving emergency response during crises with real-time reports.",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "To get a premium subscription: ",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "1. Go to Apps -> Search safety check -> Click Safety Check search result and click the **Buy a subscription** button.\r\r2. On the Choose a plan page, select the monthly plan -> Click the **Checkout** button -> Update the quantity equal to your team size -> Enter a payment method -> Click the **Place Order** button\r",
        wrap: true,
      },
      {
        type: "TextBlock",
        text: "Best,\n\nTeam Safety Check",
        wrap: true,
      },
    ],
    msteams: {
      entities: [
        {
          type: "mention",
          text: `<at>${userName}</at>`,
          mentioned: {
            id: userId,
            name: userName,
          },
        },
      ],
    },
  };
};

const getWelcomeMessageCardForChannel = (userName, userId) => {
  return {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.4",
    body: [
      {
        type: "TextBlock",
        text: "👋 Hi, I'm the Safety Check bot!",
        wrap: true,
        horizontalAlignment: "center",
        size: "large",
        color: "accent",
        weight: "bolder",
      },
      {
        type: "TextBlock",
        text: `**<at>${userName}</at>** added me to your team to help reach you during an emergency and ensure you are safe.`,
        wrap: true,
        horizontalAlignment: "center",
        color: "accent",
      },
      {
        type: "Image",
        //convert image to base 64 using url: https://www.base64encoder.io/image-to-base64-converter/
        url: "data:image/png;base64,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",
        horizontalAlignment: "center",
        spacing: "Medium",
      },
      {
        type: "TextBlock",
        text: "You can also request assistance during emergencies by going to the **Safety Check** tab added at the top of this channel -> Click the SOS - **I Need Assistance** button.",
        wrap: true,
        spacing: "Medium",
      },
    ],
    msteams: {
      entities: [
        {
          type: "mention",
          text: `<at>${userName}</at>`,
          mentioned: {
            id: userId,
            name: userName,
          },
        },
      ],
    },
  };
};

module.exports = {
  getWelcomeMessageCard,
  getWelcomeMessageCardformpersonal,
  getWelcomeMessageCard2,
  getSubcriptionSelectionCard,
  getAfterUsrSubscribedTypeOneCard,
  getAfterUsrSubscribedTypeTwoCard,
  getTypeTwoFiveDayBeforeCard,
  getTypeTwoSubscriptionEndCard,
  getTypeThreeSubscriptionStartedCard,
  getTypeThreeFiveDayBeforeOneTimePaymentCard,
  getTypeThreeFiveDayBeforeRecurringPaymentCard,
  getCancelRecurringSubcriptionStepCard,
  getTypeThreeSubscriptionEndCard,
  getTypeTwoSevenDayBeforeCard,
  getTypeTwoThreeDayBeforeCard,
  getTestIncPreviewCard,
  getTestIncPreviewCard1,
  getWelcomeMessageCardForChannel,
};
