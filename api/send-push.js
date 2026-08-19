import PushNotifications from "@pusher/push-notifications-server";

const instanceId = process.env.PUSHER_BEAMS_INSTANCE_ID || "71cf24d7-5e54-48d2-a980-2bd7495d6ef2";
const secretKey = process.env.PUSHER_BEAMS_SECRET_KEY || "1F8FCAB9D92DB920B3137EBFF0F86940F98478C8F96C808D2491D529866947EA";

let beamsServerClient = null;

function getBeamsClient() {
  if (!beamsServerClient) {
    beamsServerClient = new PushNotifications({
      instanceId,
      secretKey,
    });
  }
  return beamsServerClient;
}

export default async function handler(req, res) {
  // CORS setup
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader("Access-Control-Allow-Headers", "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const bodyData = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { targetUid, interest, title, body, icon, deepLink, deep_link } = bodyData;

    const targetInterest = interest || (targetUid ? `user_${targetUid}` : "hello");
    const linkUrl = deepLink || deep_link || "https://lynk-app.vercel.app";

    const client = getBeamsClient();
    const publishResponse = await client.publishToInterests([targetInterest], {
      web: {
        notification: {
          title: title || "New message on Lynk",
          body: body || "You received a new message",
          icon: icon || "/icon-192.jpg",
          deep_link: linkUrl,
        },
        data: {
          targetUid: targetUid || "",
          timestamp: Date.now()
        }
      },
    });

    return res.status(200).json({
      success: true,
      interest: targetInterest,
      publishResponse,
    });
  } catch (error) {
    console.error("Pusher Beams Publish Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to publish push notification",
    });
  }
}
