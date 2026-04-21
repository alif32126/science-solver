require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const http = require("http");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

console.log("TOKEN found:", TOKEN ? "YES" : "NO");
console.log("GEMINI KEY found:", GEMINI_KEY ? "YES" : "NO");

if (!TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN missing!");
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Bot is running!");
}).listen(PORT, () => {
  console.log("HTTP server running on port " + PORT);
});

const bot = new TelegramBot(TOKEN, { polling: true });
console.log("Science Solver Bot started!");

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "বন্ধু";
  bot.sendMessage(chatId,
    "🔬 Science Solver Bot এ স্বাগতম, " + name + "!\n\n" +
    "গণিত, পদার্থবিজ্ঞান, রসায়নের যেকোনো প্রশ্নের ছবি পাঠাও — আমি বাংলায় Step-by-step সমাধান দিব!\n\n" +
    "অথবা সরাসরি টাইপ করেও প্রশ্ন করতে পারো।"
  );
});

bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  try {
    await bot.sendMessage(chatId, "⏳ ছবি বিশ্লেষণ করছি, একটু অপেক্ষা করো...");

    const photo = msg.photo[msg.photo.length - 1];
    const fileInfo = await bot.getFile(photo.file_id);
    const fileUrl = "https://api.telegram.org/file/bot" + TOKEN + "/" + fileInfo.file_path;

    const imageResponse = await axios.get(fileUrl, { responseType: "arraybuffer" });
    const imageBase64 = Buffer.from(imageResponse.data).toString("base64");

    const prompt = msg.caption || "এই ছবিতে যে গণিত, পদার্থবিজ্ঞান বা রসায়নের প্রশ্ন আছে সেটা সম্পূর্ণ বাংলায় Step-by-step সমাধান করো। প্রতিটি ধাপ আলাদা করে দেখাও এবং চূড়ান্ত উত্তর স্পষ্টভাবে দাও।";

    const geminiRes = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" + GEMINI_KEY,
      {
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
          ]
        }]
      }
    );

    const solution = geminiRes.data.candidates[0].content.parts[0].text;
    await bot.sendMessage(chatId, solution);

  } catch (error) {
    console.error("Photo error:", JSON.stringify(error.response ? error.response.data : error.message));
    await bot.sendMessage(chatId, "❌ দুঃখিত, সমস্যা হয়েছে। আবার চেষ্টা করো।");
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith("/")) return;

  try {
    await bot.sendMessage(chatId, "⏳ সমাধান করছি, একটু অপেক্ষা করো...");

    const geminiRes = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" + GEMINI_KEY,
      {
        contents: [{
          parts: [{ text: "তুমি একজন বিশেষজ্ঞ গণিত, পদার্থবিজ্ঞান ও রসায়ন শিক্ষক। সম্পূর্ণ বাংলায় Step-by-step সমাধান দাও:\n\n" + text }]
        }]
      }
    );

    const solution = geminiRes.data.candidates[0].content.parts[0].text;
    await bot.sendMessage(chatId, solution);

  } catch (error) {
    console.error("Text error:", JSON.stringify(error.response ? error.response.data : error.message));
    await bot.sendMessage(chatId, "❌ দুঃখিত, সমস্যা হয়েছে। আবার চেষ্টা করো।");
  }
});
