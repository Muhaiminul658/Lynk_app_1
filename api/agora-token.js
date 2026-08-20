import pkg from "agora-token";
const { RtcTokenBuilder, RtcRole } = pkg;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const appId = process.env.AGORA_APP_ID || "bbed08f1b0494680a4a50b7d842d2f4e";
  const appCertificate = process.env.AGORA_APP_CERTIFICATE || "4f276765b71144bd863b9488fc690911";

  const channelName = req.query.channel || req.body?.channel;
  const uid = req.query.uid || req.body?.uid || 0;
  const role = req.query.role === "subscriber" ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;

  if (!channelName) {
    return res.status(400).json({ error: "channel query parameter or body is required" });
  }

  try {
    // 24 hours expiration (86400 seconds)
    const expirationTimeInSeconds = 3600 * 24;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    let token = "";
    if (typeof uid === "string" && isNaN(Number(uid))) {
      token = RtcTokenBuilder.buildTokenWithUserAccount(
        appId,
        appCertificate,
        channelName,
        uid,
        role,
        privilegeExpiredTs,
        privilegeExpiredTs
      );
    } else {
      token = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        Number(uid) || 0,
        role,
        privilegeExpiredTs,
        privilegeExpiredTs
      );
    }

    return res.status(200).json({
      token,
      appId,
      channel: channelName,
      uid
    });
  } catch (error) {
    console.error("Agora Token Generation Error:", error);
    return res.status(500).json({ error: error.message || "Failed to generate token" });
  }
}
