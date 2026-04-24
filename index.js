require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const http = require("http");
const { createCanvas } = require("canvas");

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

const SYSTEM_PROMPT = `তুমি একজন HSC পর্যায়ের বাংলাদেশি গণিত, পদার্থবিজ্ঞান ও রসায়ন শিক্ষক।

কঠোরভাবে মানার নিয়ম:
১. সম্পূর্ণ বাংলায় লেখো।
২. LaTeX একদম নিষিদ্ধ। \frac, \tan, \sin, $$, \[ এগুলো কখনো লিখবে না।
৩. Equation এভাবে লেখো: tan θ = k tan φ, sin(θ - φ) = (k-1)/(k+1) × sin φ
৪. Greek letter সরাসরি: θ, φ, α, β, π, λ, Δ
৫. ভগ্নাংশ: (a+b)/(c+d)
৬. ধাপ ১, ধাপ ২ করে লেখো।
৭. শেষে "∴ উত্তর:" দিয়ে শেষ করো।`;

// Solution কে সুন্দর image এ convert করো
function textToImage(text) {
  const width = 800;
  const fontSize = 22;
  const lineHeight = 34;
  const padding = 40;
  const maxWidth = width - padding * 2;

  // Canvas বানাও text wrap measure করতে
  const tempCanvas = createCanvas(width, 100);
  const tempCtx = tempCanvas.getContext("2d");
  tempCtx.font = `${fontSize}px "DejaVu Sans"`;

  // Text wrap করো
  const rawLines = text.split("\n");
  const wrappedLines = [];

  for (const line of rawLines) {
    if (line.trim() === "") {
      wrappedLines.push("");
      continue;
    }
    const words = line.split(" ");
    let currentLine = "";
    for (const word of words) {
      const testLine = currentLine ? currentLine + " " + word : word;
      const metrics = tempCtx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        wrappedLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) wrappedLines.push(currentLine);
  }

  const height = wrappedLines.length * lineHeight + padding * 2 + 60;

  // আসল canvas বানাও
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, width, height);

  // Header bar
  ctx.fillStyle = "#16213e";
  ctx.fillRect(0, 0, width, 55);

  // Header text
  ctx.fillStyle = "#00d4ff";
  ctx.font = `bold 20px "DejaVu Sans"`;
  ctx.fillText("🔬 Science Solver Bot", padding, 35);

  // Divider line
  ctx.strokeStyle = "#00d4ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, 58);
  ctx.lineTo(width - padding, 58);
  ctx.stroke();

  // Solution text
  let y = 60 + padding;
  for (const line of wrappedLines) {
    // ধাপ detect করো
    if (line.match(/^ধাপ \d+/)) {
      ctx.fillStyle = "#ffd700";
      ctx.font = `bold ${fontSize}px "DejaVu Sans"`;
    } else if (line.startsWith("∴")) {
      ctx.fillStyle = "#00ff88";
      ctx.font = `bold ${fontSize}px "DejaVu Sans"`;
    } else if (line.startsWith("**") || line.startsWith("##")) {
      ctx.fillStyle = "#00d4ff";
      ctx.font = `bold ${fontSize}px "DejaVu Sans"`;
    } else {
      ctx.fillStyle = "#e8e8e8";
      ctx.font = `${fontSize}px "DejaVu Sans"`;
    }

    const cleanLine = line.replace(/\*\*/g, "").replace(/##/g, "");
    ctx.fillText(cleanLine, padding, y);
    y += lineHeight;
  }

  return canvas.toBuffer("image/png");
}

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
    "প্রশ্নের ছবি তুলে পাঠাও — সুন্দর image এ সমাধান পাবে!\n\n" +
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
        console.log("Failed:", model);
      }
    }

    if (solution) {
      try {
        const imageBuffer = textToImage(solution);
        await bot.sendPhoto(chatId, imageBuffer, { filename: "solution.png" });
      } catch (imgErr) {
        console.error("Image error:", imgErr.message);
        await bot.sendMessage(chatId, solution);
      }
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
      try {
        const imageBuffer = textToImage(solution);
        await bot.sendPhoto(chatId, imageBuffer, { filename: "solution.png" });
      } catch (imgErr) {
        console.error("Image error:", imgErr.message);
        await bot.sendMessage(chatId, solution);
      }
    } else {
      await bot.sendMessage(chatId, "❌ সব model এখন busy। একটু পরে আবার চেষ্টা করো।");
    }

  } catch (error) {
    console.error("Text error:", error.message);
    await bot.sendMessage(chatId, "❌ দুঃখিত, সমস্যা হয়েছে। আবার চেষ্টা করো।");
  }
});
