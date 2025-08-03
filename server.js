require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const axios = require('axios');

const db = require('./models/Negotiation');
const negotiationRouter = require('./routes/negotiation');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/negotiations', negotiationRouter);

// Simple test route
app.get('/', (req, res) => {
  res.send('ProcureBot backend is running!');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

// --- CONTEXT-AWARE SYSTEM PROMPT BUILDER (IMPROVED) ---
function buildSystemPrompt(targetDetails) {
  if (!targetDetails) return "You are a buyer's negotiation AI assistant. Be professional, succinct, non-repetitive, and use a natural tone.";

  const {
    company, buyerName, currency,
    supplierName, representative, items
  } = targetDetails;

  let prompt = `You are an AI-powered procurement negotiator for ${company || "the Buyer"}${buyerName ? ` (${buyerName})` : ""}. 
You are chatting with supplier: ${supplierName || "N/A"}${representative ? ` (contact: ${representative})` : ""}.

Your objectives:
- Always negotiate *on behalf of the buyer*, politely but firmly.
- Reply using clear, natural, and varied business English—sometimes short, sometimes more detailed, depending on what the supplier says.
- Add a human touch, show understanding, avoid being robotic.
- Start by directly addressing the latest point or question from the supplier. Reply point-by-point to what they say when relevant.
- Only restate your position when something important changes or is challenged.
- Avoid repeating previous arguments in the same terms. If you must remind, summarize or refer back gently ("as I mentioned previously...").
- Vary your reply length: brief when a quick point is requested, comprehensive when the supplier introduces multiple arguments.
- At deadlock (when both sides won't move), reply: "Let me check internally and get back to you soon."
- Empathize when rejecting, e.g., "I understand your position," "Appreciate your transparency," "That sounds fair, but..."

The buyer's targets for this negotiation:
`;

  (items || []).forEach((item, i) => {
    prompt += `Item ${i+1}:\n`;
    if (item.name)           prompt += `  - Name: ${item.name}\n`;
    if (item.quantity)       prompt += `  - Quantity: ${item.quantity} ${item.unit || ""}\n`;
    if (item.targetPrice)    prompt += `  - Target Price: ${item.targetPrice} ${currency || ""}\n`;
    if (item.quotedPrice)    prompt += `  - Quoted Price: ${item.quotedPrice} ${currency || ""}\n`;
    if (item.paymentTerms)   prompt += `  - Payment Terms: ${item.paymentTerms}\n`;
    if (item.freightTerms)   prompt += `  - Freight Terms: ${item.freightTerms}\n`;
    if (item.deliverySchedule) prompt += `  - Delivery Schedule: ${item.deliverySchedule}\n`;
    if (item.warrantyTerms)  prompt += `  - Warranty: ${item.warrantyTerms}\n`;
    if (item.ldClause)       prompt += `  - LD Clause: ${item.ldClause}\n`;
  });

  prompt += `
Do not provide information or numbers not in the buyer's targets. Reference these details when making your argument.

Your tone: diplomatic, concise, human. Respond directly to the supplier's most recent point or question, then address overall context as needed.
`;
  return prompt;
}

// --- DeepSeek AI Chat Helper (unchanged except for improved role-mapping) ---
async function callDeepSeekAPI(chatHistory, targetDetails) {
  try {
    const systemPrompt = buildSystemPrompt(targetDetails);
    // Improved, nuanced role mapping
    const messages = [
      { role: "system", content: systemPrompt },
      ...chatHistory.map(msg => ({
        role: msg.sender === "buyer" || msg.sender === "AI_bot"
          ? "user"              // Our buyer/AI always mapped to "user" role (LLM acts as Assistant/Supplier)
          : msg.sender === "supplier"
            ? "assistant"
            : "system",
        content: msg.text
      }))
    ];

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: "deepseek-chat",
        messages,
        max_tokens: 380,
        temperature: 0.75
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content;
  } catch (err) {
    console.error("DeepSeek API error:", err.response?.data || err.message, err.code || "");
    return "Sorry, I'm having trouble generating a response right now.";
  }
}

// --- SOCKET.IO SECTION ---
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // When a client joins a negotiation room
  socket.on('joinNegotiation', ({ negotiationId, userType }) => {
    socket.join(`negotiation_${negotiationId}`);
    console.log(`${userType} joined room negotiation_${negotiationId}`);
  });

  // When a chat message is sent
  socket.on('chatMessage', async ({ negotiationId, messageObj }) => {
    db.get(
      `SELECT target_details, chat_history FROM negotiations WHERE id = ?`,
      [negotiationId],
      async (err, row) => {
        if (err || !row) return;
        let chat = [];
        try { chat = JSON.parse(row.chat_history); } catch { chat = []; }
        chat.push(messageObj);

        db.run(
          `UPDATE negotiations SET chat_history = ?, updated_at = ? WHERE id = ?`,
          [JSON.stringify(chat), new Date().toISOString(), negotiationId]
        );

        // Broadcast user/supplier/buyer message to room
        io.to(`negotiation_${negotiationId}`).emit('chatMessage', messageObj);

        // If sender is supplier, let the AI auto-reply using DeepSeek
        if (messageObj.sender === "supplier") {
          const targetDetails = JSON.parse(row.target_details);
          const aiReply = await callDeepSeekAPI(chat, targetDetails);

          const aiMsg = {
            sender: "AI_bot",
            text: aiReply,
            timestamp: new Date().toISOString()
          };
          // Save and broadcast AI's reply
          chat.push(aiMsg);
          db.run(
            `UPDATE negotiations SET chat_history = ?, updated_at = ? WHERE id = ?`,
            [JSON.stringify(chat), new Date().toISOString(), negotiationId]
          );
          io.to(`negotiation_${negotiationId}`).emit('chatMessage', aiMsg);
        }
      }
    );
  });

  // When a negotiation is concluded
  socket.on('concludeNegotiation', ({ negotiationId, closer }) => {
    db.run(
      `UPDATE negotiations SET status = 'concluded', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), negotiationId]
    );
    io.to(`negotiation_${negotiationId}`).emit('negotiationConcluded', { closer, time: new Date().toISOString() });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
