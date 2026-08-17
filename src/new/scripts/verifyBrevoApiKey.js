require("dotenv").config();
const SibApiV3Sdk = require("sib-api-v3-sdk");

async function checkBrevoKey() {
  console.log("---------------------------------------------------");
  console.log("🔑 TESTING BREVO API KEY AUTHENTICATION");
  console.log("---------------------------------------------------");

  const apiKey = (process.env.BREVO_API_KEY || "").trim();
  const senderEmail = (process.env.BREVO_SENDER_EMAIL || "").trim();

  console.log("API Key Length:", apiKey.length);
  console.log("Sender Email:", senderEmail);

  if (!apiKey) {
    console.error("❌ BREVO_API_KEY is missing in .env!");
    process.exit(1);
  }

  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  defaultClient.authentications["api-key"].apiKey = apiKey;

  const accountApi = new SibApiV3Sdk.AccountApi();

  try {
    const accountInfo = await accountApi.getAccount();
    console.log("✅ SUCCESS! Brevo API Key is valid.");
    console.log("   Account Email:", accountInfo.email);
    console.log("   Account Plan:", JSON.stringify(accountInfo.plan));
    process.exit(0);
  } catch (error) {
    console.error("❌ BREVO API ERROR:", error.message || error);
    if (error.response && error.response.text) {
      console.error("   Response Text:", error.response.text);
    }
    process.exit(1);
  }
}

checkBrevoKey();
