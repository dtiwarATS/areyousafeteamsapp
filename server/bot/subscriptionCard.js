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
    //       text: "If you need any help or want to share feedback, feel free to reach out to my makers at [help@safetybot.in](mailto:help@safetybot.in)",
    //       wrap: true
    //     }
    //   ]
    // };
}

const getContactUsBtnJSON = () => {
    return {
        "type": "ActionSet",
        "actions": [
            {
                "type": "Action.OpenUrl",
                "title": "Contact us",
                "url": "mailto:help@safetybot.in",
            }
        ]
    }
}

const getFAQBtnJSON = () => {
    return {
        "type": "ActionSet",
        "actions": [
            {
                "type": "Action.OpenUrl",
                "title": "Frequently Asked Questions",
                "url": "https://safetybot.in/frequently_asked_questions.html",
                "iconUrl": "https://safetybot.in/img/help.png"
            }
        ]
    }
}

const getManageLicenseBtnJSON = (userEmailId) => {
    return {
        "type": "ActionSet",
        "actions": [
            {
                "type": "Action.OpenUrl",
                "title": "Manage Licenses",
                "url": `https://areyousafesubscriptionpage.azurewebsites.net/?isFromSafetyBot=true&emailid=${userEmailId}`,
                "iconUrl": "https://safetybot.in/img/help.png"
            }
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

const getWelcomeMessageCard = (teamMemberCount, userEmailId) => {
    const faqAndContactUsColumnSetJSON = getFaqAndContactUsColumnSetJSON();
    const body = [
        {
            "type": "TextBlock",
            "text": "**Hello, Thank you for installing AreYouSafe? bot. Your automated and personalized crisis management assistant is up and running.**",
            "wrap": true
        },
        {
            "type": "TextBlock",
            "text": "Click on the Dashboard tab above to access all features. ",
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

    if (teamMemberCount > 10) {
        const manageLicenseColumnSet = getManageLicenseColumnSet(userEmailId);
        body.push(manageLicenseColumnSet);
    }
    return {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.0",
        body
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
            {
                "type": "TextBlock",
                "text": "If you wish to subscribe to **AreYouSafe? bot** premium, please [Click Here](https://google.com).",
                "wrap": true
            }
        ]
    }
}

const getTypeTwoSubscriptionEndCard = (expiryDate, userEmailId) => {
    const helfullLinkJSON = getHelfullLinkJSON(userEmailId);
    return {
        "type": "AdaptiveCard",
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "version": "1.4",
        "body": [
            {
                "type": "TextBlock",
                "text": `**Hello, Your 45-day free trial of the AreYouSafe? bot premium version has ended on ${expiryDate}.** You are now on the free version. AreYouSafe? bot will work for 10 users.`,
                "wrap": true
            },
            {
                "type": "TextBlock",
                "text": "If you wish to subscribe to **AreYouSafe? bot** premium, please [Click Here](https://google.com). ",
                "wrap": true
            },
            ...helfullLinkJSON
        ]
    }
}

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
            {
                "type": "TextBlock",
                "text": "If you wish to subscribe to **AreYouSafe? bot** premium, please [Click Here](https://google.com).",
                "wrap": true
            }
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
            {
                "type": "TextBlock",
                "text": "If you wish to subscribe to **AreYouSafe? bot** premium, please [Click Here](https://google.com).",
                "wrap": true
            },
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
            {
                "type": "TextBlock",
                "text": "If you wish to subscribe to **AreYouSafe? bot** premium, please [Click Here](https://google.com). ",
                "wrap": true
            },
            ...helfullLinkJSON
        ]
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
    getTypeThreeSubscriptionEndCard
}