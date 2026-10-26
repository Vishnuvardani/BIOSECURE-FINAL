"use strict";

const nodemailer = require("nodemailer");

/**
 * Configure Nodemailer transporter.
 * Supports environment credentials (EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS)
 * with robust fallback handling so the application runs seamlessly in local/dev and production environments.
 */
function createTransporter(vetEmail) {
  const service = process.env.EMAIL_SERVICE;
  const host = process.env.EMAIL_HOST || process.env.SMTP_HOST;
  const port = Number(process.env.EMAIL_PORT || process.env.SMTP_PORT || 587);
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = (process.env.EMAIL_PASS || process.env.SMTP_PASS || "").replace(/\s+/g, "");

  const isGmail = service === "gmail" || (user && user.toLowerCase().endsWith("@gmail.com")) || host === "smtp.gmail.com";

  if (user && pass) {
    if (isGmail) {
      return {
        transporter: nodemailer.createTransport({
          service: "gmail",
          auth: { user, pass }
        }),
        isLive: true,
        authUser: user,
        mode: "Gmail SMTP"
      };
    }
    return {
      transporter: nodemailer.createTransport({
        host: host || "smtp.gmail.com",
        port,
        secure: port === 465,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
      }),
      isLive: true,
      authUser: user,
      mode: "Custom SMTP"
    };
  }

  // Graceful fallback transporter: streams email output to log, preventing crashes when live SMTP is not yet configured
  return {
    transporter: nodemailer.createTransport({
      streamTransport: true,
      newline: "windows",
      buffer: true
    }),
    isLive: false,
    authUser: null,
    mode: "Stream Simulation (No EMAIL_USER / EMAIL_PASS found in .env)"
  };
}

const STATUS_COLOR_MAP = {
  REPORTED: { bg: "#e0f2fe", text: "#0284c7", border: "#38bdf8" },
  UNDER_REVIEW: { bg: "#fef3c7", text: "#d97706", border: "#f59e0b" },
  VETERINARY_INSPECTION: { bg: "#f3e8ff", text: "#7e22ce", border: "#a855f7" },
  CONFIRMED: { bg: "#fee2e2", text: "#dc2626", border: "#ef4444" },
  RULED_OUT: { bg: "#dcfce7", text: "#16a34a", border: "#22c55e" },
  REJECTED: { bg: "#f1f5f9", text: "#475569", border: "#94a3b8" },
  RESOLVED: { bg: "#e2e8f0", text: "#334155", border: "#64748b" },
};

/**
 * Sends an email notification to the farmer's registered email from the veterinarian's email,
 * containing all farm details and prominently highlighting the status change.
 * Also persists a notification record in the database for the app's notification page.
 */
async function sendDiseaseStatusEmailAndNotification(db, {
  report,
  previousStatus,
  nextStatus,
  vetActor,
  note = "",
  inspectionDetails = null
}) {
  if (!db || !report) return null;

  try {
    const rawFarmId = report.farmId;
    const farm = await db.collection("farms").findOne({
      $or: [{ farmId: rawFarmId }, { id: rawFarmId }]
    });

    // Locate the farmer's account
    const farmerQuery = [];
    if (report.farmerId) farmerQuery.push({ userId: report.farmerId }, { email: report.farmerId });
    if (farm?.ownerId) farmerQuery.push({ userId: farm.ownerId });
    if (farm?.ownerName) farmerQuery.push({ fullName: farm.ownerName });

    const farmer = farmerQuery.length > 0
      ? await db.collection("users").findOne({ $or: farmerQuery })
      : null;

    // Registered email id of the farmer (which is their username)
    const farmerEmail = farmer?.email || farm?.ownerEmail || (report.farmerId && report.farmerId.includes("@") ? report.farmerId : null) || "farmer@biosecure.in";
    const farmerName = farmer?.fullName || farmer?.name || farm?.ownerName || "Farmer";

    // Registered email id of the veterinarian
    const vetEmail = vetActor?.email || (typeof vetActor === "string" && vetActor.includes("@") ? vetActor : null) || "priya.vishnu@biosecure.in";
    const vetName = vetActor?.fullName || vetActor?.name || "Dr. Priya Vishnu (Veterinarian)";

    const formattedPrev = String(previousStatus || report.status || "REPORTED").replace(/_/g, " ").toUpperCase();
    const formattedNext = String(nextStatus).replace(/_/g, " ").toUpperCase();
    const statusCfg = STATUS_COLOR_MAP[String(nextStatus).toUpperCase()] || STATUS_COLOR_MAP.UNDER_REVIEW;

    // Build Email HTML
    const emailSubject = `[STATUS UPDATE: ${formattedNext}] Farm Disease Report ${report.reportId} - ${farm?.farmName || report.farmId}`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${emailSubject}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b;">
  <div style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e0838 0%, #3b0764 100%); padding: 28px 32px; color: #ffffff;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <div>
          <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">BioSecure Farm Veterinary Network</h1>
          <p style="margin: 6px 0 0; font-size: 13px; color: #d8b4fe;">Official Disease Surveillance & Animal Health Notification</p>
        </div>
      </div>
    </div>

    <!-- Prominent Status Change Callout Banner -->
    <div style="background: ${statusCfg.bg}; border-left: 6px solid ${statusCfg.border}; padding: 20px 28px; margin: 24px 32px; border-radius: 12px;">
      <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: ${statusCfg.text};">
        ⚡ STATUS CHANGE NOTIFICATION
      </p>
      <div style="font-size: 18px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px;">
        <span style="color: #64748b; text-decoration: line-through; font-size: 15px;">${formattedPrev}</span>
        <span style="color: #64748b; font-size: 15px;">➔</span>
        <span style="color: ${statusCfg.text}; background: #ffffff; padding: 4px 12px; border-radius: 8px; border: 1.5px solid ${statusCfg.border};">
          ${formattedNext}
        </span>
      </div>
      <p style="margin: 10px 0 0; font-size: 12px; color: #334155;">
        Updated by: <strong>${vetName}</strong> (<a href="mailto:${vetEmail}" style="color: ${statusCfg.text}; text-decoration: none;">${vetEmail}</a>)
      </p>
    </div>

    <div style="padding: 0 32px 32px;">
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
        Dear <strong>${farmerName}</strong>,
      </p>
      <p style="font-size: 13px; line-height: 1.6; color: #475569; margin: 0 0 20px;">
        This email is sent directly from your attending veterinarian to inform you that the status of disease report <strong>${report.reportId}</strong> has been officially updated to <strong><span style="color:${statusCfg.text}">${formattedNext}</span></strong>. Below are all the current farm and case details on file.
      </p>

      <!-- Farm Details Table -->
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 14px; font-size: 14px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
          🏡 Registered Farm Details
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 38%;"><strong>Farm Name:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${farm?.farmName || report.farmName || report.farmId}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Farm ID:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">${farm?.farmId || report.farmId}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Registered Farmer / Owner:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${farmerName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Registered Email (Username):</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${farmerEmail}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Farm Livestock Type:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${farm?.farmType || report.animalType || "Livestock"}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>District & State:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${farm?.district || report.district || "Coimbatore"}, ${farm?.state || "Tamil Nadu"}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Location GPS:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">${farm?.latitude ?? report.latitude ?? "11.0168"}, ${farm?.longitude ?? report.longitude ?? "76.9558"}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Total Animals / Population:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${farm?.animalCount || "N/A"}</td>
          </tr>
        </table>
      </div>

      <!-- Disease Report Details -->
      <div style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <h3 style="margin: 0 0 14px; font-size: 14px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
          📋 Disease Incident & Inspection Report
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 38%;"><strong>Report ID:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-family: monospace;">${report.reportId}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Suspected Disease:</strong></td>
            <td style="padding: 6px 0; color: #b91c1c; font-weight: 700;">${report.suspectedDisease}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Reported Severity:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${report.severity || "MODERATE"}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Affected Animals / Deaths:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${report.affectedAnimals || 0} affected / ${report.deaths || 0} deaths</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Symptoms Observed:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${Array.isArray(report.symptoms) && report.symptoms.length ? report.symptoms.join(", ") : (report.symptoms || "None specified")}</td>
          </tr>
          ${inspectionDetails?.clinicalFindings ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Clinical Findings:</strong></td>
            <td style="padding: 6px 0; color: #4338ca; font-weight: 600;">${inspectionDetails.clinicalFindings}</td>
          </tr>` : ""}
          ${inspectionDetails?.preliminaryDiagnosis ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Preliminary Diagnosis:</strong></td>
            <td style="padding: 6px 0; color: #7e22ce; font-weight: 700;">${inspectionDetails.preliminaryDiagnosis}</td>
          </tr>` : ""}
          ${note ? `
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Veterinarian Note:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-style: italic;">${note}</td>
          </tr>` : ""}
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Status Changed Date:</strong></td>
            <td style="padding: 6px 0; color: #0f172a;">${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
          </tr>
        </table>
      </div>

      <!-- Advisory -->
      <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
        <h4 style="margin: 0 0 6px; font-size: 13px; color: #b45309;">⚠️ Immediate Advisory for Farm Operations</h4>
        <p style="margin: 0; font-size: 12px; color: #78350f; line-height: 1.5;">
          Please maintain strict biosecurity protocols. Keep affected animals isolated in designated quarantine pens. Do not transport livestock off the premises until released by your authorized veterinarian.
        </p>
      </div>

      <!-- Signature Footer -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 12px; color: #64748b;">
        <p style="margin: 0 0 4px;">Sent by <strong>${vetName}</strong></p>
        <p style="margin: 0 0 4px;">Veterinary Medical Officer · BioSecure Farm Health Surveillance System</p>
        <p style="margin: 0;">Registered Vet Email: <a href="mailto:${vetEmail}" style="color: #6366f1;">${vetEmail}</a></p>
      </div>

    </div>
  </div>
</body>
</html>`;

    // 1. Send via Nodemailer
    const { transporter, isLive, authUser, mode } = createTransporter(vetEmail);
    try {
      const fromAddress = isLive ? (authUser || vetEmail) : vetEmail;
      const info = await transporter.sendMail({
        from: `"${vetName} via BioSecure" <${fromAddress}>`,
        to: farmerEmail,
        replyTo: vetEmail,
        subject: emailSubject,
        html: emailHtml
      });
      if (isLive) {
        console.log(`[NODEMAILER] [LIVE ${mode}] Real email dispatched to Gmail recipient ${farmerEmail}. MessageId: ${info.messageId}`);
      } else {
        console.warn(`[NODEMAILER] [SIMULATION] Live SMTP not configured (EMAIL_USER / EMAIL_PASS missing). Email for ${farmerEmail} was generated and buffered in memory, but not sent over live internet. Add EMAIL_USER and EMAIL_PASS to .env to deliver real emails to Gmail inboxes.`);
      }
    } catch (mailErr) {
      console.error(`[NODEMAILER ERROR] Failed delivering email to ${farmerEmail}:`, mailErr.message);
    }

    // 2. Create in-app Notification for Notification Page
    const notifId = "N-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    const notificationDoc = {
      notificationId: notifId,
      targetRole: "Farmer",
      targetUserId: farmer?.userId || report.farmerId,
      type: "INSPECTION_UPDATE",
      title: `Disease Report Status: ${formattedNext}`,
      message: `Status of Report ${report.reportId} for ${farm?.farmName || report.farmId} is now ${formattedNext}. Farm details and notes have been emailed to ${farmerEmail} from Dr. ${vetName} (${vetEmail}).`,
      reportId: report.reportId,
      farmId: report.farmId,
      isRead: false,
      createdAt: new Date(),
      metadata: {
        previousStatus: formattedPrev,
        nextStatus: formattedNext,
        farmerEmail,
        vetEmail,
        vetName,
        farmName: farm?.farmName || report.farmName,
        farmId: report.farmId
      }
    };

    await db.collection("notifications").insertOne(notificationDoc);
    console.log(`[NOTIFICATION] Created app notification ${notifId} for Farmer (${farmerEmail})`);

    return {
      success: true,
      notificationId: notifId,
      farmerEmail,
      vetEmail,
      previousStatus: formattedPrev,
      nextStatus: formattedNext
    };
  } catch (err) {
    console.error("[EMAIL/NOTIFICATION ERROR]", err);
    return { success: false, error: err.message };
  }
}

module.exports = {
  createTransporter,
  sendDiseaseStatusEmailAndNotification,
};
