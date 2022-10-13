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

const getContactUSLinkTextBlockJSON = () => {
    return {
        "type": "TextBlock",
        "text": "[Contact us](mailto:help@safetybot.in)",
        "wrap": true,
        "iconUrl": "https://safetybot.in/img/help.png",
        "color": "Attention",
    }
}
const getFAQLinkColumnJSON = () => {
    return [
        {
            "type": "Column",
            "width": "auto",
            "items": [
                {
                    "type": "TextBlock",
                    "text": "[Frequently Asked Questions](https://safetybot.in/img/help.png)",
                    "wrap": true,
                    "color": "Attention"
                }
            ]
        },
        {
            "type": "Column",
            "width": "auto",
            "items": [
                {
                    "type": "Image",
                    "url": "https://safetybot.in/img/help.png"
                }
            ]
        }
    ];
}

const getManageLicenseColumnJSON = () => {
    return [
        {
            "type": "Column",
            "width": "auto",
            "items": [
                {
                    "type": "TextBlock",
                    "text": "[Manage Licenses](https://safetybot.in/img/help.png)",
                    "wrap": true,
                    "color": "Attention"
                }
            ]
        },
        {
            "type": "Column",
            "width": "auto",
            "items": [
                {
                    "type": "Image",
                    "url": "https://safetybot.in/img/help.png"
                }
            ]
        }
    ]
}

const getFaqAndContactUsColumnSetJSON = () => {
    const faqLinkColumnJSON = getFAQLinkColumnJSON();
    const contactUSLinkTextBlockJSON = getContactUSLinkTextBlockJSON();
    return {
        "type": "ColumnSet",
        "columns": [
            {
                "type": "Column",
                "width": "auto",
                "items": [
                    {
                        "type": "ColumnSet",
                        "columns": faqLinkColumnJSON
                    }
                ]
            },
            {
                "type": "Column",
                "width": "stretch",
                "items": [
                    contactUSLinkTextBlockJSON
                ]
            }
        ]
    }
}

const getManageLicenseColumnSet = () => {
    const manageLicenseColumnJSON = getManageLicenseColumnJSON();
    return {
        "type": "ColumnSet",
        "columns": manageLicenseColumnJSON
    }
}

const getWelcomeMessageCard = (teamMemberCount) => {
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
        const manageLicenseColumnSet = getManageLicenseColumnSet();
        body.push(manageLicenseColumnSet);
    }
    return {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.0",
        body
    };
}

getSelectionSubcriptionCard = (teamMemberCount) => {
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
                        "verb": "newUsrSubscriptionType1"
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

getAfterUsrSubscribedTypeOneCard = () => {
    const faqAndContactUsColumnSetJSON = getFaqAndContactUsColumnSetJSON();
    const manageLicenseColumnSet = getManageLicenseColumnSet();
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
            {
                "type": "TextBlock",
                "text": "Helpful links",
                "wrap": true,
                "separator": true
            },
            faqAndContactUsColumnSetJSON,
            manageLicenseColumnSet
        ]
    };
    return card;
}

getAfterUsrSubscribedTypeTwoCard = (userName) => {
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

module.exports = {
    getWelcomeMessageCard,
    getSelectionSubcriptionCard,
    getAfterUsrSubscribedTypeOneCard,
    getAfterUsrSubscribedTypeTwoCard
}