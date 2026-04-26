require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const http = require("http");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

if (!TOKEN || !OPENROUTER_KEY) {
  console.error("Environment variables missing!");
  process.exit(1);
}

/* ---------------- HTTP SERVER ---------------- */

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Science Solver Bot is running!");
}).listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

/* ---------------- SELF PING ---------------- */

const RENDER_URL = process.env.RENDER_URL;

if (RENDER_URL) {
  setInterval(async () => {
    try {
      await axios.get(RENDER_URL);
      console.log("Self-ping successful");
    } catch (error) {
      console.log("Self-ping failed");
    }
  }, 14 * 60 * 1000);
}

/* ---------------- TELEGRAM BOT ---------------- */

const bot = new TelegramBot(TOKEN, {
  polling: true
});

console.log("Science Solver Bot started successfully!");

/* ---------------- MODELS ---------------- */

const VISION_MODELS = [
  "qwen/qwen2.5-vl-72b-instruct:free",
  "google/gemma-3-27b-it:free",
  "nvidia/nemotron-nano-12b-v2-vl:free"
];

const TEXT_MODELS = [
  "deepseek/deepseek-r1-0528:free",
  "qwen/qwen3-235b-a22b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "google/gemma-3-27b-it:free"
];

/* ---------------- PROMPTS ---------------- */

const SCIENCE_PROMPT = `
তুমি একজন HSC পর্যায়ের বাংলাদেশি গণিত, পদার্থবিজ্ঞান ও রসায়ন শিক্ষক।

নিয়ম:
1. সম্পূর্ণ বাংলায় উত্তর দাও।
2. LaTeX ব্যবহার করবে না।
3. ধাপে ধাপে সমাধান করবে।
4. Equation সাধারণ টেক্সটে লিখবে।
5. শেষে "∴ উত্তর:" লিখবে।
`;

const CHAT_PROMPT = `
তুমি একটি বন্ধুসুলভ বাংলাদেশি Science Solver Bot।
সাধারণ কথার সহজ বাংলায় উত্তর দাও।
`;

/* ---------------- LATEX CLEANER ---------------- */

function cleanLatex(text) {
  return text
    .replace(/\\theta/g, "θ")
    .replace(/\\phi/g, "φ")
    .replace(/\\alpha/g, "α")
    .replace(/\\beta/g, "β")
    .replace(/\\gamma/g, "γ")
    .replace(/\\delta/g, "δ")
    .replace(/\\pi/g, "π")
    .replace(/\\lambda/g, "λ")
    .replace(/\\omega/g, "ω")
    .replace(/\\Delta/g, "Δ")
    .replace(/\\sin/g, "sin")
    .replace(/\\cos/g, "cos")
    .replace(/\\tan/g, "tan")
    .replace(/\\sqrt\{([^}]+)\}/g, "√($1)")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/\\cdot/g, "×")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\$\$/g, "")
    .replace(/\$/g, "")
    .replace(/\\\\/g, "\n")
    .replace(/\\text\{([^}]+)\}/g, "$1")
    .replace(/[{}]/g, "")
    .trim();
}

/* ---------------- IMAGE GENERATOR ---------------- */

async function createSolutionImage(solution) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  const page = await browser.newPage();

  const html = `
  <!DOCTYPE html>
  <html lang="bn">
  <head>
    <meta charset="UTF-8">
    <style>
      body {
        width: 1000px;
        margin: 0;
        padding: 40px;
        background: linear-gradient(135deg, #eff6ff, #dbeafe);
        font-family: Arial, sans-serif;
      }

      .card {
        background: white;
        border-radius: 30px;
        padding: 50px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      }

      h1 {
        text-align: center;
        color: #2563eb;
        margin-bottom: 40px;
        font-size: 50px;
      }

      pre {
        white-space: pre-wrap;
        word-wrap: break-word;
        font-size: 28px;
        line-height: 1.9;
        color: #111827;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>সমাধান</h1>
      <pre>${solution}</pre>
    </div>
  </body>
  </html>
  `;

  await page.setContent(html, {
    waitUntil: "networkidle0"
  });

  const filePath = path.join(
    __dirname,
    `solution_${Date.now()}.png`
  );

  await page.screenshot({
    path: filePath,
    fullPage: true
  });

  await browser.close();
  return filePath;
}

/* ---------------- OPENROUTER API ---------------- */

async function callAPI(model, messages) {
  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model,
      messages,
      temperature: 0.2
    },
    {
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://science-solver-bot.onrender.com",
        "X-Title": "Science Solver Bot"
      },
      timeout: 30000
    }
  );

  return response.data.choices[0].message.content;
}

/* ---------------- HELPERS ---------------- */

function isScienceQuestion(text) {
  const keywords = [
    "সমাধান",
    "প্রমাণ",
    "নির্ণয়",
    "গণনা",
    "হিসাব",
    "sin",
    "cos",
    "tan",
    "বল",
    "বেগ",
    "ত্বরণ",
    "রসায়ন",
    "পদার্থ",
    "গণিত"
  ];

  return keywords.some(word =>
    text.toLowerCase().includes(word.toLowerCase())
  );
}

async function generateResponse(models, messages) {
  for (const model of models) {
    try {
      console.log(`Trying: ${model}`);
      const result = await callAPI(model, messages);
      console.log(`Success: ${model}`);
      return result;
    } catch (error) {
      console.log(`Failed: ${model}`);
    }
  }

  return null;
}

async function sendSolutionImage(chatId, solution) {
  const cleaned = cleanLatex(solution);
  const imagePath = await createSolutionImage(cleaned);

  await bot.sendPhoto(chatId, imagePath, {
    caption: "✅ সমাধান প্রস্তুত"
  });

  fs.unlinkSync(imagePath);
}

/* ---------------- COMMANDS ---------------- */

bot.onText(/\/start/, async (msg) => {
  const name = msg.from.first_name || "বন্ধু";

  await bot.sendMessage(
    msg.chat.id,
    `🔬 Science Solver Bot এ স্বাগতম, ${name}!

📚 গণিত
⚡ পদার্থবিজ্ঞান
🧪 রসায়ন

প্রশ্ন লিখে পাঠাও অথবা ছবি পাঠাও।`
  );
});

/* ---------------- PHOTO HANDLER ---------------- */

bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  try {
    await bot.sendMessage(chatId, "⏳ ছবি বিশ্লেষণ করছি...");

    const photo = msg.photo[msg.photo.length - 1];
    const file = await bot.getFile(photo.file_id);

    const fileUrl =
      `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;

    const response = await axios.get(fileUrl, {
      responseType: "arraybuffer"
    });

    const base64 = Buffer.from(response.data).toString("base64");

    const caption =
      msg.caption ||
      "এই ছবির প্রশ্নটি বাংলায় ধাপে ধাপে সমাধান করো।";

    const messages = [
      {
        role: "system",
        content: SCIENCE_PROMPT
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: caption
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64}`
            }
          }
        ]
      }
    ];

    const solution = await generateResponse(
      VISION_MODELS,
      messages
    );

    if (!solution) {
      return bot.sendMessage(
        chatId,
        "❌ সব AI model বর্তমানে ব্যস্ত।"
      );
    }

    await sendSolutionImage(chatId, solution);
  } catch (error) {
    console.error(error);
    await bot.sendMessage(
      chatId,
      "❌ ছবি প্রসেস করতে সমস্যা হয়েছে।"
    );
  }
});

/* ---------------- TEXT HANDLER ---------------- */

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text || text.startsWith("/")) return;

  try {
    const science = isScienceQuestion(text);

    await bot.sendMessage(
      chatId,
      science
        ? "⏳ সমাধান করছি..."
        : "⏳ ভাবছি..."
    );

    const messages = [
      {
        role: "system",
        content: science
          ? SCIENCE_PROMPT
          : CHAT_PROMPT
      },
      {
        role: "user",
        content: text
      }
    ];

    const solution = await generateResponse(
      TEXT_MODELS,
      messages
    );

    if (!solution) {
      return bot.sendMessage(
        chatId,
        "❌ সব AI model বর্তমানে ব্যস্ত।"
      );
    }

    if (science) {
      await sendSolutionImage(chatId, solution);
    } else {
      await bot.sendMessage(chatId, cleanLatex(solution));
    }
  } catch (error) {
    console.error(error);
    await bot.sendMessage(
      chatId,
      "❌ একটি সমস্যা হয়েছে। আবার চেষ্টা করো।"
    );
  }
});
