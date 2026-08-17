require("dotenv").config();
const SibApiV3Sdk = require("sib-api-v3-sdk");

async function checkBrevoLogs() {
  console.log("---------------------------------------------------");
  console.log("🔍 CHECKING BREVO TRANSACTIONAL EMAIL LOGS");
  console.log("---------------------------------------------------");

  const apiKey = (process.env.BREVO_API_KEY || "").trim();
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  defaultClient.authentications["api-key"].apiKey = apiKey;

  const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

  try {
    const logs = await apiInstance.getSmtpReport({ limit: 10 });
    console.log("Brevo Smtp Report Logs:", JSON.stringify(logs, null, 2));

    const sendersApi = new SibApiV3Sdk.SendersApi();
    const senders = await sendersApi.getSenders();
    console.log("\nVerified Senders in Brevo Account:", JSON.stringify(senders, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("❌ ERROR fetching Brevo logs:", error.message || error);
    if (error.response && error.response.text) {
      console.error("Response:", error.response.text);
    }
    process.exit(1);
  }
}

checkBrevoLogs();
