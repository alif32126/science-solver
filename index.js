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

// প্রতি ১৪ মিনিটে self-ping করে bot জাগিয়ে রাখো
const RENDER_URL = "https://science-solver-bot-a3hr.onrender.com";
setInterval(() => {
  axios.get(RENDER_URL).then(() => {
    console.log("Self-ping OK");
  }).catch(() => {});
}, 14 * 60 * 1000);

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

const SCIENCE_PROMPT = `তুমি একজন HSC পর্যায়ের বাংলাদেশি গণিত, পদার্থবিজ্ঞান ও রসায়ন শিক্ষক।

কঠোর নিয়ম:
১. সম্পূর্ণ বাংলায় লেখো।
২. LaTeX সম্পূর্ণ নিষিদ্ধ। \frac, \tan, \sin, \cos, $$, \[, \] এগুলো কখনো লিখবে না।
৩. Equation এভাবে লেখো: tan θ = k tan φ, sin(θ - φ) = (k-1)/(k+1) × sin α
৪. Greek letter সরাসরি লেখো: θ, φ, α, β, π, λ, Δ, ω
৫. ভগ্নাংশ: (a+b)/(c+d) এভাবে লেখো
৬. ঘাত: a², b³, x^n এভাবে লেখো
৭. ধাপ ১:, ধাপ ২: করে লেখো
৮. শেষে "∴ উত্তর:" দিয়ে শেষ করো`;

const CHAT_PROMPT = `তুমি একটি বাংলাদেশি Science Solver Bot। 
যদি কেউ সাধারণ কথা বলে (যেমন Hi, Hello, কেমন আছ) তাহলে বাংলায় সহজভাবে উত্তর দাও।
যদি বিজ্ঞান বা গণিতের প্রশ্ন করে তাহলে ভালোভাবে সমাধান করো।`;

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

function isScienceQuestion(text) {
  const keywords = ["সমাধান", "প্রমাণ", "নির্ণয়", "গণনা", "হিসাব", "equation", "sin", "cos", "tan", "force", "velocity", "acceleration", "mol", "atom", "বল", "বেগ", "ত্বরণ", "তরঙ্গ", "চাপ", "তাপ", "আলো", "বিদ্যুৎ", "রাসায়নিক", "যৌগ"];
  return keywords.some(k => text.toLowerCase().includes(k.toLowerCase()));
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || "বন্ধু";
  bot.sendMessage(chatId,
    "🔬 *Science Solver Bot* এ স্বাগতম, " + name + "!\n\n" +
    "📐 গণিত | ⚡ পদার্থবিজ্ঞান | 🧪 রসায়ন\n\n" +
    "প্রশ্নের ছবি পাঠাও অথবা টাইপ করো!",
    { parse_mode: "Markdown" }
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
      { role: "system", content: SCIENCE_PROMPT },
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
    const isScience = isScienceQuestion(text);
    const systemPrompt = isScience ? SCIENCE_PROMPT : CHAT_PROMPT;

    await bot.sendMessage(chatId, isScience ? "⏳ সমাধান করছি..." : "⏳ ...");

    const messages = [
      { role: "system", content: systemPrompt },
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
