require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { NewMessage } = require("telegram/events");
const input = require("input");
const mongoose = require("mongoose");

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.SESSION_STRING || "");
const mongoUri = process.env.MONGO_URI;

// Messages aur delay config
const rawMsgs = process.env.PROMO_MESSAGES || "";
const MESSAGES = rawMsgs.split("|").map(m => m.trim()).filter(m => m.length > 0);
const delayMinutes = Number(process.env.DELAY_MINUTES) || 5;
const autoReplyMsg = process.env.AUTO_REPLY_MESSAGE || "";

// MongoDB Schema for Auto-Reply Persistence
const replySchema = new mongoose.Schema({
    chatId: { type: String, unique: true },
    repliedAt: { type: Date, default: Date.now }
});
const ReplyModel = mongoose.model("Reply", replySchema);

async function connectDB() {
    if (mongoUri) {
        try {
            await mongoose.connect(mongoUri);
            console.log("✅ MongoDB Connected!");
        } catch (e) {
            console.log("❌ MongoDB Connection Error:", e.message);
        }
    }
}

(async () => {
    console.log("🚀 Starting fully automatic userbot with DB support...");
    
    await connectDB();

    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => await input.text("📱 Phone number: "),
        password: async () => await input.text("🔐 Password: "),
        phoneCode: async () => await input.text("📩 Code: "),
        onError: (err) => console.log(err),
    });

    console.log("✅ Logged in successfully!");

    // DM Auto-Reply System (DB Based)
    if (autoReplyMsg.length > 0) {
        client.addEventHandler(async (event) => {
            const message = event.message;
            if (message.isPrivate && !message.out) {
                const chatId = message.chatId.toString();
                
                try {
                    // Check if we already replied to this user in DB
                    const alreadyReplied = await ReplyModel.findOne({ chatId });
                    
                    if (!alreadyReplied) {
                        await client.sendMessage(chatId, { message: autoReplyMsg });
                        console.log(`💬 Auto-replied to user: ${chatId}`);
                        
                        // Save to DB so we don't reply again after restart
                        await ReplyModel.create({ chatId });
                    }
                } catch (e) {
                    console.log(`❌ Auto-reply error for ${chatId}:`, e.message);
                }
            }
        }, new NewMessage({ incoming: true }));
        console.log("🤖 PERSISTENT Auto-reply for Private Messages is active!");
    }

    // Automatic Promotion Loop
    async function runPromotionLoop() {
        console.log("🔄 Fetching all joined groups...");
        let groupsToPromo = [];
        try {
            const dialogs = await client.getDialogs({});
            for (const dialog of dialogs) {
                if (dialog.isGroup || dialog.isMegaGroup) {
                    groupsToPromo.push(dialog.id);
                }
            }
        } catch (e) {
            console.log("❌ Failed to fetch groups:", e.message);
        }

        console.log(`🎯 Found ${groupsToPromo.length} groups to promote in.`);

        if (groupsToPromo.length > 0) {
            for (let groupId of groupsToPromo) {
                try {
                    const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
                    await client.sendMessage(groupId, { message: msg });
                    console.log(`✅ Sent to Group ID ${groupId}: ${msg}`);
                    
                    // Human gap between groups (15s - 40s)
                    const humanGap = Math.floor(Math.random() * (40000 - 15000)) + 15000; 
                    await new Promise(r => setTimeout(r, humanGap)); 
                } catch (err) {
                    console.log(`⚠️ Skip Group ${groupId}: ${err.message}`);
                }
            }
        }

        const baseDelayMs = delayMinutes * 60 * 1000;
        const extraVariationMs = Math.floor(Math.random() * 90000); 
        const finalDelay = baseDelayMs + extraVariationMs;
        
        console.log(`\n⏳ Round completed! Next round in ${Math.floor(finalDelay / 60000)} min ${Math.floor((finalDelay % 60000) / 1000)} sec...`);
        setTimeout(runPromotionLoop, finalDelay);
    }

    runPromotionLoop();
})();