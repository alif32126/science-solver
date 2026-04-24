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
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-3-27b-it:free",
  "google/gemma-3-12b-it:free",
  "google/gemma-3-4b-it:free",
  "baidu/qianfan-ocr-fast:free"
];

const TEXT_MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-3-27b-it:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-12b-it:free",
  "google/gemma-3-4b-it:free",
  "meta-llama/llama-3.2-3b-instruct:free"
];

const SYSTEM_PROMPT = `তুমি একজন অভিজ্ঞ বাংলাদেশি গণিত, পদার্থবিজ্ঞান ও রসায়ন শিক্ষক। তুমি ঠিক বাংলা পাঠ্যবইয়ের মতো করে সমাধান লেখো।

IMPORTANT RULES - এগুলো অবশ্যই মানতে হবে:

1. সম্পূর্ণ বাংলায় লেখো।

2. Equation লেখার নিয়ম - বইয়ের মতো plain text এ লেখো:
   - tan θ = k tan φ
   - sin(θ - φ) = (k-1)/(k+1) × sin φ
   - a² + b² = c²
   - v = u + at
   - F = ma

3. কখনো LaTeX ব্যবহার করবে না। মানে \tan, \frac, \sin, \[ \], $$ এগুলো লেখা সম্পূর্ণ নিষিদ্ধ।

4. Greek letter গুলো সরাসরি লেখো: θ, φ, α, β, γ, π, λ, μ, ω, Δ

5. ভগ্নাংশ এভাবে লেখো: (a+b)/(c+d)

6. গুণ চিহ্ন: × বা · ব্যবহার করো

7. প্রতিটি ধাপ নম্বর দিয়ে লেখো:
   ধাপ ১:
   ধাপ ২:
   ধাপ ৩:

8. শেষে "∴ উত্তর:" দিয়ে চূড়ান্ত উত্তর দাও।`;

async function callAPI(model, messages) {
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    { model, messages },
    {
      headers: {
        "Authorization": "Bearer " + OPENROUTER_KEY,
        "Content-Type": "application/json"
      },
      timeout: 30000
    }
  );
  return response.data.choices[0].message.content;
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "বন্ধু";
  bot.sendMessage(chatId,
    "🔬 Science Solver Bot এ স্বাগতম, " + name + "!\n\n" +
    "📐 গণিত\n⚡ পদার্থবিজ্ঞান\n🧪 রসায়ন\n\n" +
    "যেকোনো প্রশ্নের ছবি পাঠাও — বাংলায় Step-by-step সমাধান পাবে!\n\n" +
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
        console.log("Failed:", model);
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
        console.log("Failed:", model);
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
