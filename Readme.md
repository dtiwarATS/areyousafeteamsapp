# Are you Safe

## Prerequisites

1. Register for a bot service on azure portal and add microsoft teams to it. (Save the microsoft app_id and pass_phrase)

2. [NodeJS](https://nodejs.org/en/download/) must be installed on your development machine (version 14.1 or higher recommened)

    ```bash
    # determine node version
    node --version
    ```

3. To test locally, you'll need [Ngrok](https://ngrok.com/) installed on your development machine.
Make sure you've downloaded and installed Ngrok on your local machine. ngrok will tunnel requests from the Internet to your local computer and terminate the SSL connection from Teams.

## To run this app locally

- Clone the repository

    ```bash
    git clone https://github.com/dtiwarATS/areyousafeteamsapp.git
    ```

- In a console, navigate to `areyousafeteamsapp` folder in the bash terminal

    ```bash
    cd <path-to-the-cloned-directory>/areyousafeteamsapp
    ```

- Run ngrok - point to port `3978`

    ```bash
    ngrok http 3978
    ```

- Rename the `.env.sample` file to `.env` and Update the `.env` configuration for the bot to use the `MicrosoftAppId` (Microsoft App Id) and `MicrosoftAppPassword` (App Password) from the Bot Framework registration and along with other required configurations.
> NOTE: the App Password is referred to as the `client secret` in the azure portal and you can always create a new client secret anytime.

- Create a new app using App Studio in Microsoft teams, enter all the required details for your bot.
> NOTE: While entering details in App studio, make sure to use the same `MicrosoftAppId` that was provided from azure bot registration.

- Install modules & Run the `NodeJS` Server 
  - Server will run on PORT:  `3978`
    - Open a terminal and navigate to project root directory

    ```bash
    npm install #use this command for first time only
    npm start
    ```

> NOTE: It is recommened to install `nodemon` module and use `nodemon server` command so that you dont have re-start the server everytime changes are made.

- Goto to the your registered Bot service page on Azure portal. Click on "Configuration" menu and then enter the current running ngrok URL inside "Messaging endpoint" textbox and append the `/api/messages` to the end of that enetered URL.
- For Example: If your ngrok URL is `https://7e70-182-237-162-85.ngrok.io` then the final URL should look like `https://7e70-182-237-162-85.ngrok.io/api/messages` 
- Then Click on "Test in Web Chat" menu and then click on "Start over" link.

- Install the newly created app inside Microsoft Teams and then type `@YOUR-APP-NAME hi`. If your app responds then it means app is installed successfully on your local machine or else contact the responsible team member for the help with the installation process.
