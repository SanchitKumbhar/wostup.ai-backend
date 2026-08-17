const SibApiV3Sdk = require('sib-api-v3-sdk');

// Configure API key
const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
// Create API instance
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Service function
async function sendEmailService(name, email, role) {
    try {
        const sendSmtpEmail = {
            subject: "Team Invite Mail",
            htmlContent: `
                <html>
                    <body>
                        <h1>Hello ${name}!</h1>
                        <p>You have been invited as <b>${role}</b>.</p>
                    </body>
                </html>
            `,
            sender: {
                name: "Wostup",
                email: "notify@wostup.com"
            },
            to: [{
                email: email,
                name: name
            }]
        };

        const response = await apiInstance.sendTransacEmail(sendSmtpEmail);

        console.log("Email sent:", response);
        return 200;

    } catch (error) {
        console.error("Email error:", error);
        return 400;
    }
}

module.exports = { sendEmailService };