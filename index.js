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

const VISION_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-3-27b-it:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "google/gemma-3-12b-it:free",
  "google/gemma-3-4b-it:free"
];

const TEXT_MODELS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-3-27b-it:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "google/gemma-3-12b-it:free",
  "meta-llama/llama-3.2-3b-instruct:free"
];

const SYSTEM_PROMPT = `তুমি একজন HSC পর্যায়ের বাংলাদেশি গণিত, পদার্থবিজ্ঞান ও রসায়ন শিক্ষক। তোমার কাজ হলো যেকোনো প্রশ্ন সহজ ও পরিষ্কারভাবে বাংলায় সমাধান করা।

কঠোরভাবে মানার নিয়ম:
১. সম্পূর্ণ বাংলায় লেখো।
২. LaTeX একদম নিষিদ্ধ। \frac, \tan, \sin, $$, \[ এগুলো কখনো লিখবে না।
৩. Equation এভাবে লেখো:
   - tan θ = k tan φ
   - sin(θ - φ) = (k-1)/(k+1) × sin φ
   - v² = u² + 2as
   - F = ma
৪. Greek letter সরাসরি: θ, φ, α, β, π, λ, Δ
৫. ভগ্নাংশ: (a+b)/(c+d)
৬. ধাপ ১, ধাপ ২ করে লেখো।
৭. শেষে "∴ উত্তর:" দিয়ে শেষ করো।
৮. সহজ ভাষায় বুঝিয়ে দাও।`;

async function callAPI(model, messages) {
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    { model, messages, temperature: 0.3 },
    {
      headers: {
        "Authorization": "Bearer " + OPENROUTER_KEY,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://science-solver-bot.onrender.com",
        "X-Title": "Science Solver Bot"
      },
      timeout: 45000
    }
  );
  return response.data.choices[0].message.content;
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "বন্ধু";
  bot.sendMessage(chatId,
    "🔬 Science Solver Bot এ স্বাগতম, " + name + "!\n\n" +
    "📐 গণিত | ⚡ পদার্থবিজ্ঞান | 🧪 রসায়ন\n\n" +
    "প্রশ্নের ছবি তুলে পাঠাও — বাংলায় Step-by-step সমাধান পাবে!\n\n" +
    "অথবা টাইপ করেও প্রশ্ন করতে পারো।"
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
    const caption = msg.caption || "এই ছবিতে যে প্রশ্ন আছে সেটা বাংলায় ধাপে ধাপে সমাধান করো।";

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: caption },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64," + imageBase64 } }
        ]
      }
    ];

    let solution = null;
    for (const model of VISION_MODELS) {
      try {
        console.log("Trying:", model);
        solution = await callAPI(model, messages);
        console.log("Success:", model);
        break;
      } catch (e) {
        console.log("Failed:", model, e.response ? e.response.data.error : e.message);
      }
    }

    if (solution) {
      await bot.sendMessage(chatId, solution);
    } else {
      await bot.sendMessage(chatId, "❌ সব model এখন busy। একটু পরে আবার চেষ্টা করো।");
    }

  } catch (error) {
    console.error("Photo error:", error.message);
    await bot.sendMessage(chatId, "❌ দুঃখিত, সমস্যা হয়েছে। আবার চেষ্টা করো।");
  }
});

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text || text.startsWith("/")) return;

  try {
    await bot.sendMessage(chatId, "⏳ সমাধান করছি...");

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text }
    ];

    let solution = null;
    for (const model of TEXT_MODELS) {
      try {
        console.log("Trying:", model);
        solution = await callAPI(model, messages);
        console.log("Success:", model);
        break;
      } catch (e) {
        console.log("Failed:", model, e.response ? e.response.data.error : e.message);
      }
    }

    if (solution) {
      await bot.sendMessage(chatId, solution);
    } else {
      await bot.sendMessage(chatId, "❌ সব model এখন busy। একটু পরে আবার চেষ্টা করো।");
    }

  } catch (error) {
    console.error("Text error:", error.message);
    await bot.sendMessage(chatId, "❌ দুঃখিত, সমস্যা হয়েছে। আবার চেষ্টা করো।");
  }
});
