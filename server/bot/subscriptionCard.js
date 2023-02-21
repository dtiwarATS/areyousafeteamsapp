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
    //       text: "If you need any help or want to share feedback, feel free to reach out to my makers at [help@areyousafe.in](mailto:help@areyousafe.in)",
    //       wrap: true
    //     }
    //   ]
    // };
}

const subscriptionLink = "https://teams.microsoft.com/l/app/884e521a-dadc-41e9-a8af-fcaa907e783e?source=app-details-dialog";

const subcriptionLinkJSON = {
    "type": "TextBlock",
    "text": `If you wish to subscribe to **AreYouSafe? bot** premium, please [Click Here](${subscriptionLink}).`,
    "wrap": true
}

const contactUsActionObj = {
    "type": "Action.OpenUrl",
    "title": "Contact us",
    "url": "mailto:help@areyousafe.in",
    "id": "contactUsAction"
}
const getContactUsBtnJSON = () => {
    return {
        "type": "ActionSet",
        "actions": [
            contactUsActionObj
        ]
    }
}

const faqActionObj = {
    "type": "Action.OpenUrl",
    "title": "Frequently Asked Questions",
    "url": "https://areyousafe.in/frequently_asked_questions.html",
    "iconUrl": "https://areyousafe.in/img/help.png",
    "id": "faqAction"
}

const getFAQBtnJSON = () => {
    return {
        "type": "ActionSet",
        "actions": [
            faqActionObj
        ]
    }
}

const getManageLicenseActionObj = (userEmailId) => {
    return {
        "type": "Action.OpenUrl",
        "title": "Manage Licenses",
        "url": `https://areyousafesubscriptionpage.azurewebsites.net/?isFromSafetyBot=true&emailid=${userEmailId}`,
        "iconUrl": "https://areyousafe.in/img/help.png",
        "id": "manageLicenseAction"
    }
}
const getManageLicenseBtnJSON = (userEmailId) => {
    return {
        "type": "ActionSet",
        "actions": [
            getManageLicenseActionObj(userEmailId)
        ]
    }
}

const getFaqAndContactUsColumnSetJSON = () => {
    const faqBtnJSON = getFAQBtnJSON();
    const contactUsBtnJSON = getContactUsBtnJSON();
    return {
        "type": "ColumnSet",
        "columns": [
            {
                "type": "Column",
                "width": "auto",
                "items": [
                    faqBtnJSON
                ]
            },
            {
                "type": "Column",
                "width": "auto",
                "items": [
                    contactUsBtnJSON
                ],
                "verticalContentAlignment": "Center"
            }
        ]
    }
}

const getManageLicenseColumnSet = (userEmailId) => {
    const manageLicenseBtnJSON = getManageLicenseBtnJSON(userEmailId);
    return {
        "type": "ColumnSet",
        "columns": [
            {
                "type": "Column",
                "width": "auto",
                "items": [
                    manageLicenseBtnJSON
                ]
            }
        ]
    }
}

const getHelpActionSet = (teamMemberCount, userEmailId) => {
    const manageLicenseActionObj = getManageLicenseActionObj(userEmailId);

    const actionArr = [
        faqActionObj
    ];
    if (teamMemberCount > 10) {
        actionArr.push(manageLicenseActionObj);
    }
    actionArr.push(contactUsActionObj);
    return actionArr
}

const getWelcomeMessageCard = (teamMemberCount, companyData, teamName, newInc) => {
    const userEmailId = companyData.userEmailId;

    let btnSafe = {
        type: "Action.Execute",
        title: "I am safe",
        "isEnabled": false
    }
    let btnAssistance = {
        type: "Action.Execute",
        title: "I need assistance",
        "isEnabled": false
    }
    const helpActionSet = getHelpActionSet(teamMemberCount, userEmailId);
    const safetyCheckMessageText = `This is a **${newInc.incTitle}** from <at>${newInc.incCreatedByName}</at>. Please click any of the buttons below to help them test the bot.`;
    const body = [
        {
            "type": "TextBlock",
            "text": `Welcome to the AreYouSafe bot!`,
            "wrap": true
        },
        {
            "type": "TextBlock",
            "text": `I will help you communicate with your team during a crisis.`,
            "wrap": true,
            "spacing": "None",
        },
        {
            "type": "TextBlock",
            "text": `To get started, let's send out a test safety check message to team - **${teamName}** (${teamMemberCount} members) through a direct message.`,
            "wrap": true
        },
        {
            "type": "TextBlock",
            "text": "Here is how the message will look to your team members:",
            "wrap": true,
            "spacing": "None",
        },
        {
            "type": "TextBlock",
            "text": " ",
            "separator": true,
            "wrap": true
        },
        {
            type: "TextBlock",
            wrap: true,
            text: safetyCheckMessageText
        },
        {
            type: "ActionSet",
            actions: [
                btnSafe,
                btnAssistance
            ]
        },
        {
            "type": "TextBlock",
            "text": " ",
            "wrap": true
        },
        {
            type: "TextBlock",
            wrap: true,
            separator: true,
            text: `Click on **Continue** to send this message to everyone.`
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "width": "auto",
                    "items": [
                        {
                            "type": "ActionSet",
                            "actions": [
                                {
                                    "type": "Action.Execute",
                                    "title": "Continue",
                                    "verb": "triggerTestSafetyCheckMessage",
                                    "style": "positive",
                                    "data": {
                                        "inc": newInc,
                                        "companyData": companyData
                                    }
                                }
                            ],
                        }
                    ]
                },
                {
                    "type": "Column",
                    "width": "stretch",
                    "items": [
                        {
                            "type": "ActionSet",
                            "actions": [
                                {
                                    "type": "Action.ToggleVisibility",
                                    "title": "Help",
                                    "targetElements": ["helpActionSetToggle"]
                                }
                            ],
                        },
                        {
                            "type": "ActionSet",
                            "isVisible": false,
                            "id": "helpActionSetToggle",
                            "actions": helpActionSet,
                        }
                    ]
                }
            ]
        }
    ];

    return {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.5",
        body,
        msteams: {
            entities: [{
                type: "mention",
                text: `<at>${companyData.userName}</at>`,
                mentioned: {
                    id: companyData.userId,
                    name: companyData.userName,
                },
            }]
        },
    };
}

const getSubcriptionSelectionCard = (teamMemberCount, companyData) => {
    return {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": `I can see that you have ${teamMemberCount} users in your team. AreYouSafe? bot FREE version will work for up to 10 users. Alternatively, you can start your 45-day free trial of the premium version and get AreYouSafe? bot access for unlimited users.`,
                "wrap": true
            },
            {
                "type": "ActionSet",
                "actions": [
                    {
                        "type": "Action.Execute",
                        "title": "Continue with the free version (10 users)",
                        "verb": "newUsrSubscriptionType1",
                        "data": {
                            companyData
                        }
                    }
                ]
            },
            {
                "type": "ActionSet",
                "actions": [
                    {
                        "type": "Action.Execute",
                        "title": "Start a 45-day free trial of premium version (unlimited users)",
                        "verb": "newUsrSubscriptionType2"
                    }
                ]
            }
        ]
    }
}

const getHelfullLinkJSON = (userEmailId) => {
    const faqAndContactUsColumnSetJSON = getFaqAndContactUsColumnSetJSON();
    const manageLicenseColumnSet = getManageLicenseColumnSet(userEmailId);
    return [
        {
            "type": "TextBlock",
            "text": "Helpful links",
            "wrap": true,
            "separator": true
        },
        faqAndContactUsColumnSetJSON,
        manageLicenseColumnSet
    ];
}

const getAfterUsrSubscribedTypeOneCard = (userEmailId) => {
    const helfullLinkJSON = getHelfullLinkJSON(userEmailId);
    const card = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.0",
        body: [
            {
                "type": "TextBlock",
                "text": "Hello! Click on the **Dashboard tab** above to access all features.",
                "wrap": true
            },
            ...helfullLinkJSON
        ]
    };
    return card;
}

const getAfterUsrSubscribedTypeTwoCard = (userName) => {
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + 45);
    const faqAndContactUsColumnSetJSON = getFaqAndContactUsColumnSetJSON();
    const card = {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.0",
        body: [
            {
                "type": "TextBlock",
                "text": `**Hello ${userName}, your AreYouSafe? bot Premium 45-day free trial is activated and expires on ${currentDate.toLocaleDateString()}!**`,
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "Click on the **Dashboard tab** above to access all features.",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "Helpful links",
                "wrap": true,
                "separator": true
            },
            faqAndContactUsColumnSetJSON
        ]
    };
    return card;
}

const getTypeTwoFiveDayBeforeCard = (expiryDate) => {
    return {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": `**Hello, Your 45-day free trial of the AreYouSafe? bot premium version is about to expire on ${expiryDate}**. After the trial has ended, you will be on the free version. AreYouSafe? bot will work for 10 users.`,
                "wrap": true
            },
            subcriptionLinkJSON
        ]
    }
}

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

const getTypeThreeSubscriptionStartedCard = (userCount, startDate, endDate, userObj) => {
    const mentionUserEntities = [
        {
            type: "mention",
            text: `<at>${userObj.name}</at>`,
            mentioned: userObj
        }
    ]
    return {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": `Hello, <at>${userObj.name}</at>`,
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": `Your AreYouSafe? bot **premium subscription is activated on ${startDate} for ${userCount} users** and expires on ${endDate}! `,
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "Type **Help** in your chat window If you are not sure of what to do next",
                "wrap": true
            }
        ],
        "msteams": {
            "entities": mentionUserEntities
        }
    }
}

const getTypeThreeFiveDayBeforeOneTimePaymentCard = (userCount, expiryDate) => {
    return {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": `**Your AreYouSafe? bot monthly premium subscription for ${userCount} users is about to expire on ${expiryDate}!**`,
                "wrap": true
            },
            subcriptionLinkJSON
        ]
    }
}

const getTypeThreeFiveDayBeforeRecurringPaymentCard = (userCount, expiryDate) => {
    return {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": `**Your AreYouSafe? bot monthly premium subscription for ${userCount} users is about to expire on ${expiryDate}!** After that, your credit card will be charged $0.5 per user/month to continue the AreYouSafe? bot premium version.                `,
                "wrap": true
            },
            subcriptionLinkJSON,
            {
                "type": "ActionSet",
                "actions": [
                    {
                        "type": "Action.Execute",
                        "title": "I want to cancel my subscription",
                        "verb": "cancelRecurringPaymentSubcription"
                    }
                ]
            }
        ]
    }
}

const getCancelRecurringSubcriptionStepCard = () => {
    return {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": "Follow these steps to cancel your subscription",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "1. Log in with the Microsoft account you have used to purchase your subscription \n2. Click Here and click on the **Buy a subscription** button \n3. Click on the **Manage subscriptions** link \n4. You will be navigated to the Microsoft 365 admin center page >> Under the Subscription status, Click on the **Cancel Subscription** link",
                "wrap": true
            }
        ]
    }
}

const getTypeThreeSubscriptionEndCard = (expiryDate, userEmailId) => {
    const helfullLinkJSON = getHelfullLinkJSON(userEmailId);
    return {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": `**Your AreYouSafe? bot premium subscription has ended on ${expiryDate}.** You are now on the free version. AreYouSafe? bot will work for 10 users.`,
                "wrap": true
            },
            subcriptionLinkJSON,
            ...helfullLinkJSON
        ]
    }
}

const getTypeTwoSevenDayBeforeCard = (userId, userName) => {
    return {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": `Hi <at>${userName}</at>`,
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "Your AreYouSafe free trial ends in 7-days. When your trial expires, we will switch you to the Free version that works for a team of up to 10 users.",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "Please **Buy a subscription** to continue reaching out to all your employees during emergencies with the AreYouSafe bot.",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "Have questions about pricing? Access our ↗ [FAQ page](https://areyousafe.in/frequently_asked_questions.html)",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "To Buy a subscription: ",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "1. Go to Apps -> Search are you safe -> Click Are You Safe? search result and click the **Buy a subscription** button.\r\r2. On the Choose a plan page, select the monthly plan -> Click the **Checkout** button -> Update the quantity equal to your team size -> Enter a payment method -> Click the **Place Order** button\r",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "Best,\n\nTeam AreYouSafe",
                "wrap": true
            }
        ],
        "msteams": {
            "entities": [{
                type: "mention",
                text: `<at>${userName}</at>`,
                mentioned: {
                    id: userId,
                    name: userName,
                },
            }]
        }
    }
}

const getTypeTwoThreeDayBeforeCard = (userId, userName) => {
    return {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": `Hi <at>${userName}</at>`,
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "Your unlimited trial ends in 3 days.",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "Without an **upgrade to premium**, you won't be able to reach all employees during emergencies using the AreYouSafe bot. Our plan starts at $0.50 user/month.",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "Need to extend your trial? [Contact Us](mailto:help@areyousafe.in)",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "To get a premium subscription: ",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "1. Go to Apps -> Search are you safe -> Click Are You Safe? search result and click the **Buy a subscription** button.\r\r2. On the Choose a plan page, select the monthly plan -> Click the **Checkout** button -> Update the quantity equal to your team size -> Enter a payment method -> Click the **Place Order** button\r",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "Best,\n\nTeam AreYouSafe",
                "wrap": true
            }
        ],
        "msteams": {
            "entities": [{
                type: "mention",
                text: `<at>${userName}</at>`,
                mentioned: {
                    id: userId,
                    name: userName,
                },
            }]
        }
    }
}

const getTypeTwoSubscriptionEndCard = (userId, userName, teamName) => {
    return {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": `Hi <at>${userName}</at>`,
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": `Your free trial has ended. You are now on the free version. AreYouSafe bot will work for up to 10 users (in alphabetical order by the first name) of your team ${teamName}.`,
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "Upgrade to our premium subscription plan to continue improving emergency response during crises with real-time reports.",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "To get a premium subscription: ",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "1. Go to Apps -> Search are you safe -> Click Are You Safe? search result and click the **Buy a subscription** button.\r\r2. On the Choose a plan page, select the monthly plan -> Click the **Checkout** button -> Update the quantity equal to your team size -> Enter a payment method -> Click the **Place Order** button\r",
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "Best,\n\nTeam AreYouSafe",
                "wrap": true
            }
        ],
        "msteams": {
            "entities": [{
                type: "mention",
                text: `<at>${userName}</at>`,
                mentioned: {
                    id: userId,
                    name: userName,
                },
            }]
        }
    }
}

module.exports = {
    getWelcomeMessageCard,
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
    getTypeTwoThreeDayBeforeCard
}