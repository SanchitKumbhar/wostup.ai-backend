require('dotenv').config();

const { Worker } = require('bullmq');
const redisConnection = require("../redisConfig/bullmqRedisConnection");
const { User } = require('../models');

const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';
const pubClient = redisConnection;

const brevo = require('@getbrevo/brevo');

const TransactionalEmailsApi = brevo && (brevo.TransactionalEmailsApi || (brevo.default && brevo.default.TransactionalEmailsApi));
const ApiKeys = brevo && (brevo.TransactionalEmailsApiApiKeys || (brevo.default && brevo.default.TransactionalEmailsApiApiKeys));

let apiInstance = null;
if (TransactionalEmailsApi) {
    try {
        apiInstance = new TransactionalEmailsApi();
        if (ApiKeys && process.env.BREVO_API_KEY) {
            apiInstance.setApiKey(ApiKeys.apiKey, process.env.BREVO_API_KEY);
        }
    } catch (err) {
        console.warn('Could not construct Brevo SDK API instance, will use REST fallback:', err && err.message);
        apiInstance = null;
    }
} else {
    console.warn('Brevo SDK does not expose TransactionalEmailsApi constructor; REST fallback will be used.');
}

async function sendTransactionalEmail(payload) {
    if (apiInstance && typeof apiInstance.sendTransacEmail === 'function') {
        return apiInstance.sendTransacEmail(payload);
    }

    if (!process.env.BREVO_API_KEY) {
        throw new Error('BREVO_API_KEY not set');
    }

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': process.env.BREVO_API_KEY
        },
        body: JSON.stringify(payload)
    });

    const json = await resp.json().catch(() => null);
    if (!resp.ok) {
        const err = new Error(`Brevo REST error (status ${resp.status})`);
        err.details = json;
        throw err;
    }
    return json;
}

// Uses its own IORedis client (pubClient) rather than the "redis" package
// client workspacePresence.js uses (different library, same Redis server,
// same key) — that's fine, both point at REDIS_URL and read/write the
// same set, so presence data is shared correctly either way.
async function isUserOnlineInWorkspace(userId, workspaceId) {
    const res = await pubClient.sismember(`workspace:${workspaceId}:online_users`, userId);
    return Boolean(res);
}

const worker = new Worker(
    'DEADLINE_WORKER',
    async job => {
        if (job.name === 'task') {
            const { taskId, workspaceId, assigneeUserId, userId } = job.data || {};

            console.log('DEADLINE_WORKER received job:', { name: job.name, data: job.data });

            const online = await isUserOnlineInWorkspace(assigneeUserId, workspaceId);
            console.log(`task ${taskId} assignee ${assigneeUserId} online?`, online);

            // Only email if they're NOT currently online — if they're active
            // in the app right now, an in-app notification is enough; don't
            // also spam their inbox.
            if (online) {
                console.log(`Assignee ${assigneeUserId} is online — skipping email, in-app notification is sufficient.`);
                return;
            }

            if (!process.env.BREVO_API_KEY) {
                console.error('BREVO_API_KEY is not set. Cannot send transactional email.');
                return;
            }

            // FIXED: was hardcoded to 'sanchitskumbhar@gmail.com' regardless
            // of who assigneeUserId actually was. Now looks up the real
            // assignee's email from the User collection.
            const assignee = await User.findById(assigneeUserId);
            if (!assignee || !assignee.email) {
                console.error(`No email found for assignee ${assigneeUserId} — skipping.`);
                return;
            }

            try {
                console.log('sending transactional email for task', taskId, 'to', assignee.email);
                const resp = await sendTransactionalEmail({
                    sender: {
                        email: 'notify@wostup.com',
                        name: 'wostup'
                    },
                    to: [ { email: assignee.email } ],
                    subject: 'Task deadline notification',
                    htmlContent: `
                        <p>Your task is nearing its deadline.</p>
                        <p><a href="${appBaseUrl}/tasks/${taskId}">View task</a></p>
                    `
                });
                console.log('brevo sendTransacEmail response:', resp && typeof resp === 'object' ? JSON.stringify(resp) : resp);
            } catch (err) {
                console.error('Error sending transactional email:', err && err.message ? err.message : err);
                if (err && err.details) {
                    console.error('Brevo error details:', JSON.stringify(err.details));
                }
            }

            // In-app notification path — use the QUEUE (aiNotificationQueue.add),
            // NOT pubClient.publish("ai_notifications", ...) — that old
            // pub/sub channel has no subscriber anymore since aiNotification.js
            // was converted to a BullMQ Worker on "AINotificationQueue".
            // "ai" is now a valid Notification.type (see notifications_model.js).
            //
            // if (workspaceId && assigneeUserId) {
            //     const aiNotificationQueue = require('./aiNotificationQueue');
            //     await aiNotificationQueue.add("send-ai-notification", {
            //         workspaceId,
            //         recipientUserId: assigneeUserId,
            //         message: `AI: Task ${taskId} is nearing its deadline.`,
            //         type: "ai"
            //     }, { attempts: 3, backoff: { type: "exponential", delay: 5000 } });
            // }
        }
    },
    { connection: redisConnection }
);

module.exports = worker;