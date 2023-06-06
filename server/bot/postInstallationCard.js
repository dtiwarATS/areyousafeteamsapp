const getTestIncPreviewCard = (teamMemberCount, companyData) => {
  const userEmailId = companyData.userEmailId;
  const helpActionSet = getHelpActionSet(teamMemberCount, userEmailId);
  const safetyCheckMessageText = `This is a **Test - Safety Check - Test** from <at>${companyData.userName}</at>. Please click any of the buttons below to help them test the bot.`;
  const body = [
    {
      type: "TextBlock",
      text: "Here is how the message will look to your team members:",
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
                    companyData,
                    teamMemberCount,
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
