require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const stringSession = new StringSession(process.env.SESSION_STRING || "");

// .env se config fetch karna
const rawGroups = process.env.TARGET_GROUPS || "";
const GROUPS = rawGroups.split(",").map(g => g.trim().replace("@", "")).filter(g => g.length > 0);

const rawMsgs = process.env.PROMO_MESSAGES || "";
const MESSAGES = rawMsgs.split("|").map(m => m.trim()).filter(m => m.length > 0);

const delayMinutes = Number(process.env.DELAY_MINUTES) || 5;

(async () => {
    console.log("Starting automatic userbot...");
    console.log(`Loaded ${GROUPS.length} groups and ${MESSAGES.length} messages from .env`);
    console.log(`Base delay set to ${delayMinutes} minutes.`);

    if (GROUPS.length === 0 || MESSAGES.length === 0) {
        console.log("❌ Error: TARGET_GROUPS ya PROMO_MESSAGES khali hain .env file mein!");
        process.exit(1);
    }

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

    // Automatic Promotion Loop
    async function runPromotionLoop() {
        for (let group of GROUPS) {
            try {
                // Har group ko alag random message
                const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
                
                await client.sendMessage(group, { message: msg });
                console.log(`✅ Sent to ${group}: ${msg}`);
                
                // Insano jaisa gap groups ke beech me (15 se 40 seconds)
                const humanGap = Math.floor(Math.random() * (40000 - 15000)) + 15000; 
                await new Promise(r => setTimeout(r, humanGap)); 
            } catch (err) {
                console.log(`❌ Error in ${group}:`, err.message);
            }
        }

        // Agle round ka time (Base Time + Random 0-90 extra seconds jitter)
        const baseDelayMs = delayMinutes * 60 * 1000;
        const extraVariationMs = Math.floor(Math.random() * 90000); 
        const finalDelay = baseDelayMs + extraVariationMs;
        
        console.log(`\n⏳ Ek round pura hua! Agla round ${Math.floor(finalDelay / 60000)} min ${Math.floor((finalDelay % 60000) / 1000)} sec baad aayega...`);
        
        setTimeout(runPromotionLoop, finalDelay);
    }

    // Start loop immediately
    console.log("🚀 Starting first round automatically...");
    runPromotionLoop();

})();