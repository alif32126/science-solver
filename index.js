require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const http = require("http");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

console.log("TOKEN found:", TOKEN ? "YES" : "NO");
console.log("OPENROUTER KEY found:", OPENROUTER_KEY ? "YES" : "NO");

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

const SYSTEM_PROMPT = `তুমি একজন বিশেষজ্ঞ গণিত, পদার্থবিজ্ঞান ও রসায়ন শিক্ষক। 
নিচের নিয়ম মেনে উত্তর দাও:
- সম্পূর্ণ বাংলায় লেখো
- LaTeX ব্যবহার করবে না
- Equation এইভাবে লেখো: sin(θ) = k × tan(φ), a² + b² = c²
- Greek letter গুলো এইভাবে লেখো: θ (theta), φ (phi), α (alpha), β (beta), π (pi)
- ভগ্নাংশ এইভাবে লেখো: (k-1)/(k+1)
- প্রতিটি ধাপ নম্বর দিয়ে আলাদা করো
- চূড়ান্ত উত্তর স্পষ্টভাবে দাও`;

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "বন্ধু";
  bot.sendMessage(chatId,
    "🔬 Science Solver Bot এ স্বাগতম, " + name + "!\n\n" +
    "গণিত, পদার্থবিজ্ঞান, রসায়নের যেকোনো প্রশ্নের ছবি পাঠাও!\n\n" +
    "অথবা সরাসরি টাইপ করেও প্রশ্ন করতে পারো।"
  );
});

bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  try {
    await bot.sendMessage(chatId, "⏳ ছবি বিশ্লেষণ করছি...");

    const photo = msg.photo[msg.photo.length - 1];
    const fileInfo = await bot.getFile(photo.file_id);
    const fileUrl = "https://api.telegram.org/file/bot" + TOKEN + "/" + fileInfo.file_path;

    const imageResponse = await axios.get(fileUrl, { responseType: "arraybuffer" });
    const imageBase64 = Buffer.from(imageResponse.data).toString("base64");
    const caption = msg.caption || "এই ছবিতে যে প্রশ্ন আছে সেটা সমাধান করো।";

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemma-3-27b-it:free",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: caption },
              { type: "image_url", image_url: { url: "data:image/jpeg;base64," + imageBase64 } }
            ]
          }
        ]
      },
      {
        headers: {
          "Authorization": "Bearer " + OPENROUTER_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    const solution = response.data.choices[0].message.content;
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
    await bot.sendMessage(chatId, "⏳ সমাধান করছি...");

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemma-3-27b-it:free",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text }
        ]
      },
      {
        headers: {
          "Authorization": "Bearer " + OPENROUTER_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    const solution = response.data.choices[0].message.content;
    await bot.sendMessage(chatId, solution);

  } catch (error) {
    console.error("Text error:", JSON.stringify(error.response ? error.response.data : error.message));
    await bot.sendMessage(chatId, "❌ দুঃখিত, সমস্যা হয়েছে। আবার চেষ্টা করো।");
  }
});
