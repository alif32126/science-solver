require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const http = require("http");

// Render এর জন্য dummy HTTP server
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Science Solver Bot is running!");
}).listen(PORT, () => {
  console.log(`HTTP server running on port ${PORT}`);
});

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

console.log("TOKEN found:", TOKEN ? "YES ✅" : "NO ❌");
console.log("GEMINI KEY found:", GEMINI_KEY ? "YES ✅" : "NO ❌");

if (!TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN missing!");
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

console.log("🚀 Science Solver Bot চালু হয়েছে!");

// /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "বন্ধু";

  bot.sendMessage(
    chatId,
    `🔬 *Science Solver Bot এ স্বাগতম, ${name}!*\n\n` +
      `আমি তোমার যেকোনো সমস্যা সমাধান করতে পারব:\n\n` +
      `📐 *গণিত* — Algebra, Calculus, Trigonometry, Statistics\n` +
      `⚡ *পদার্থবিজ্ঞান* — Mechanics, Electricity, Optics, Thermodynamics\n` +
      `🧪 *রসায়ন* — Organic, Inorganic, Physical Chemistry\n\n` +
      `📸 *কীভাবে ব্যবহার করবে:*\n` +
      `শুধু প্রশ্নের ছবি তুলে পাঠাও — আমি Step-by-step সমাধান দিব!\n\n` +
      `অথবা সরাসরি টাইপ করেও প্রশ্ন করতে পারো। 😊`,
    { parse_mode: "Markdown" }
  );
});

// /help command
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(
    chatId,
    `📚 *ব্যবহার নির্দেশিকা:*\n\n` +
      `1️⃣ প্রশ্নের ছবি তুলে সরাসরি পাঠাও\n` +
      `2️⃣ অথবা টাইপ করে প্রশ্ন লিখো\n` +
      `3️⃣ আমি বাংলায় Step-by-step সমাধান দিব\n\n` +
      `✅ *যা যা করতে পারি:*\n` +
      `• গণিতের যেকোনো সমস্যা\n` +
      `• পদার্থবিজ্ঞানের numerical ও theory\n` +
      `• রসায়নের equation balance ও calculation\n` +
      `• HSC ও University level সব প্রশ্ন`,
    { parse_mode: "Markdown" }
  );
});

// Photo handler
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  try {
    await bot.sendMessage(chatId, "⏳ ছবি বিশ্লেষণ করছি, একটু অপেক্ষা করো...");

    // সবচেয়ে বড় ছবিটা নাও
    const photo = msg.photo[msg.photo.length - 1];
    const fileId = photo.file_id;

    // Telegram থেকে ছবির URL নাও
    const fileInfo = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${fileInfo.file_path}`;

    // ছবি download করো
    const imageResponse = await axios.get(fileUrl, {
      responseType: "arraybuffer",
    });
    const imageBase64 = Buffer.from(imageResponse.data).toString("base64");

    const caption = msg.caption || "";

    // Gemini API তে পাঠাও
    const solution = await solveWithGemini(imageBase64, caption, "image/jpeg");

    await bot.sendMessage(chatId, solution, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Photo error:", error);
    await bot.sendMessage(
      chatId,
      "❌ দুঃখিত, একটু সমস্যা হয়েছে। আবার চেষ্টা করো অথবা প্রশ্নটা টাইপ করে পাঠাও।"
    );
  }
});

// Text message handler
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // command গুলো skip করো
  if (!text || text.startsWith("/")) return;

  try {
    await bot.sendMessage(chatId, "⏳ সমাধান করছি, একটু অপেক্ষা করো...");

    const solution = await solveTextWithGemini(text);

    await bot.sendMessage(chatId, solution, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Text error:", error);
    await bot.sendMessage(
      chatId,
      "❌ দুঃখিত, একটু সমস্যা হয়েছে। আবার চেষ্টা করো।"
    );
  }
});

// Gemini দিয়ে ছবি থেকে solve করো
async function solveWithGemini(imageBase64, caption, mimeType) {
  const prompt =
    caption ||
    "এই ছবিতে যে গণিত, পদার্থবিজ্ঞান বা রসায়নের প্রশ্ন আছে সেটা সমাধান করো।";

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: imageBase64,
              },
            },
            {
              text: `তুমি একজন বিশেষজ্ঞ গণিত, পদার্থবিজ্ঞান ও রসায়ন শিক্ষক। 
              
${prompt}

নিয়ম:
- বাংলায় উত্তর দাও
- প্রতিটি ধাপ (Step) আলাদা করে দেখাও
- সূত্র ব্যবহার করলে সেটা উল্লেখ করো
- চূড়ান্ত উত্তর স্পষ্টভাবে দাও
- সহজ ভাষায় বুঝিয়ে দাও`,
            },
          ],
        },
      ],
    }
  );

  return response.data.candidates[0].content.parts[0].text;
}

// Gemini দিয়ে text solve করো
async function solveTextWithGemini(question) {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      contents: [
        {
          parts: [
            {
              text: `তুমি একজন বিশেষজ্ঞ গণিত, পদার্থবিজ্ঞান ও রসায়ন শিক্ষক।

প্রশ্ন: ${question}

নিয়ম:
- বাংলায় উত্তর দাও
- প্রতিটি ধাপ (Step) আলাদা করে দেখাও
- সূত্র ব্যবহার করলে সেটা উল্লেখ করো
- চূড়ান্ত উত্তর স্পষ্টভাবে দাও
- সহজ ভাষায় বুঝিয়ে দাও`,
            },
          ],
        },
      ],
    }
  );

  return response.data.candidates[0].content.parts[0].text;
}
