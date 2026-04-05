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

// Render ke liye chota HTTP server (taaki Port error na aaye)
const http = require("http");
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end("Bot is running!");
}).listen(PORT, () => {
    console.log(`🌍 Health check server running on port ${PORT}`);
});
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

    // DM Auto-Reply System (DB Based - Replied only once ever)
    if (autoReplyMsg.length > 0) {
        client.addEventHandler(async (event) => {
            const message = event.message;
            if (event.isPrivate && !message.out) {
                // Get User ID for database key
                let chatId = message.peerId && message.peerId.userId ? message.peerId.userId.toString() : 
                             (message.chatId ? message.chatId.toString() : null);

                if (!chatId) return;

                try {
                    const alreadyReplied = await ReplyModel.findOne({ chatId });
                    if (!alreadyReplied) {
                        // Use message.reply() for maximum reliability (avoids 'Entity' error)
                        await message.reply({ message: autoReplyMsg });
                        console.log(`💬 Auto-replied to user: ${chatId}`);
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
        console.log("\n🔄 Starting promotion round...");
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

        console.log(`🎯 Found ${groupsToPromo.length} groups. Sending messages...`);

        let successCount = 0;
        let skipCount = 0;

        if (groupsToPromo.length > 0) {
            for (let groupId of groupsToPromo) {
                try {
                    const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
                    await client.sendMessage(groupId, { message: msg });
                    successCount++;
                    
                    // Human gap (15s - 40s)
                    const humanGap = Math.floor(Math.random() * (40000 - 15000)) + 15000; 
                    await new Promise(r => setTimeout(r, humanGap)); 
                } catch (err) {
                    skipCount++;
                    // Log only critical group errors to keep it clean
                }
            }
        }

        console.log(`✅ Round Summary: ${successCount} sent, ${skipCount} skipped.`);

        const baseDelayMs = delayMinutes * 60 * 1000;
        const extraVariationMs = Math.floor(Math.random() * 90000); 
        const finalDelay = baseDelayMs + extraVariationMs;
        
        console.log(`⏳ Next round in ${Math.floor(finalDelay / 60000)} min...`);
        setTimeout(runPromotionLoop, finalDelay);
    }

    runPromotionLoop();
})();