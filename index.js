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
  const name = msg.from.first_name || "friend";
  bot.sendMessage(chatId,
    "Science Solver Bot e swagotom, " + name + "!\n\n" +
    "Math, Physics, Chemistry er jokono question er chobi pathao - ami solve kore dibo!\n\n" +
    "Othoba directly type kore o proshno korte paro."
  );
});

bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  try {
    await bot.sendMessage(chatId, "Chobi analyse korchi, ektu opekkha koro...");

    const photo = msg.photo[msg.photo.length - 1];
    const fileInfo = await bot.getFile(photo.file_id);
    const fileUrl = "https://api.telegram.org/file/bot" + TOKEN + "/" + fileInfo.file_path;

    const imageResponse = await axios.get(fileUrl, { responseType: "arraybuffer" });
    const imageBase64 = Buffer.from(imageResponse.data).toString("base64");

    const caption = msg.caption || "Ei chobite je math, physics ba chemistry question ache seta banglay step-by-step solve koro.";

    const geminiRes = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" + GEMINI_KEY,
      {
        contents: [{
          parts: [
            { text: caption },
            { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
          ]
        }]
      }
    );

    const solution = geminiRes.data.candidates[0].content.parts[0].text;
    await bot.sendMessage(chatId, solution);

  } catch (error) {
    console.error("Photo error:", JSON.stringify(error.response && error.response.data || error.message));
    await bot.sendMessage(chatId, "Somossa hoyeche. Abar cheshta koro.");
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith("/")) return;

  try {
    await bot.sendMessage(chatId, "Solve korchi, ektu opekkha koro...");

    const geminiRes = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" + GEMINI_KEY,
      {
        contents: [{
          parts: [{ text: "Tumi ekjon expert math, physics o chemistry teacher. Ei proshner banglay step-by-step solution dao:\n\n" + text }]
        }]
      }
    );

    const solution = geminiRes.data.candidates[0].content.parts[0].text;
    await bot.sendMessage(chatId, solution);

  } catch (error) {
    console.error("Text error:", JSON.stringify(error.response && error.response.data || error.message));
    await bot.sendMessage(chatId, "Somossa hoyeche. Abar cheshta koro.");
  }
});
