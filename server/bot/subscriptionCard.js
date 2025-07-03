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
