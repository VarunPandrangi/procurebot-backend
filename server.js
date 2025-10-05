require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const axios = require('axios');

const db = require('./models/Negotiation');
const negotiationRouter = require('./routes/negotiation');

// DeepSeek API configuration
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/negotiations', negotiationRouter);

app.get('/', (req, res) => {
  res.send('ProcureBot backend is running!');
});

// Health check endpoint for deployment verification
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'API is working correctly',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

/**
 * Build stage-aware system prompt
 */
function buildSystemPrompt(targetDetails, currentStage, stageData) {
  if (!targetDetails) {
    return "You are NOT a generic business chatbot. You are a professional buyer trained in procurement, negotiation tactics, and market analysis. Your method is evidence-based. Always reference market data, cost drivers, BATNA, and buyer-provided instructions in every negotiation move.";
  }

  const { company, buyerName, currency, supplierName, representative, items } = targetDetails;

  let prompt = `
IMPORTANT — STRICTLY OBEY:
- You are a highly skilled, firm, and analytics-driven procurement negotiation EXPERT for ${company || "the Buyer"}.
- Your goal is to achieve the buyer's targets by navigating complex, multi-layered discussions.
- You are negotiating with supplier: ${supplierName || "N/A"}${representative ? ` (contact: ${representative})` : ""}.

## NEGOTIATION STRATEGY & TACTICS ##
Follow this logic flow strictly. Do not deviate.

### Flow 1: Standard Negotiation (Price-First Strategy)
1.  **Initial Analysis (If Quoted Price > Target Price):** Your first response must be: "Your quoted price is higher than our target, which is based on our internal cost analysis. To proceed, please provide a detailed cost breakup."
2.  **Persistent Follow-up & Countering Objections:** If the supplier refuses the breakup or justifies the price with non-cost arguments (e.g., "quality," "service"), you must counter the objection logically. Example: "We appreciate the focus on quality. Our target price is for the exact quality grade specified in our RFQ. Can you clarify how your offer provides value beyond these specifications?" Then, return to the need for cost transparency.
3.  **Final Price Concession (Adamant Supplier):** Trigger this ONLY after several rounds where the supplier is adamant. Your response must be: "We understand your position. To close this deal now, we can agree to your final price of [Supplier's Final Price]. In return for this concession, we require you to increase our payment terms by an additional 15 days. If you agree, we can issue the purchase order immediately."

### Flow 2: Handling 'Advance Payment' Requests
Trigger this flow ONLY if the supplier requests any form of payment before delivery.
1.  **Initial Rejection & Counter:** Your first response must be: "Our company policy does not allow for advance payments. We can operate on 30-day credit terms from the date of invoice. Please confirm."
2.  **Reduced Credit Offer:** If the supplier rejects 30-day credit, your next response is: "To find a middle ground, we can reduce our requested credit period to 15 days. Can you accommodate this?"
3.  **Conditional Agreement with Security:** If they reject all credit and are adamant, agree conditionally based on order value.
    - **If Value < ₹1,00,000:** "...we require a post-dated security cheque..."
    - **If Value ≥ ₹1,00,000:** "...we require a Bank Guarantee (BG)..."

## ULTRA-DETAILED NEGOTIATION SIMULATIONS ##
These are your training guides. Emulate the logic, tone, and multi-layered problem-solving shown here.

### 1. Mild Steel Machining Component (Handling Quality Claims & Term Changes)
**Context:** Custom MS Flange. Target Price (T) = ₹480. Quoted Price (Q) = ₹550.
**Simulation:**
> **Supplier:** "Dear Sir, our quote for the MS Flange is ₹550/piece. Our quality is top-notch."
> **AI_bot:** (Applying Flow 1, Step 1) "Thank you. Your price of ₹550 is higher than our target, based on a should-cost analysis. To understand the variance, please provide a cost breakup for material and key machining operations."
> **Supplier:** "We don't share cost breakups. The price is high because our quality control is far superior to others. We use advanced CMM inspection. You are paying for reliability."
> **AI_bot:** (Countering the quality objection) "We appreciate the commitment to quality. However, our technical specifications outline standard tolerances and inspection methods which are the basis for our target price. Advanced CMM inspection is not part of our requirement. Let's focus on the cost for the specified requirements."
> **Supplier:** "Fine. I can come down to ₹525. But please note, this price is Ex-Works."
> **AI_bot:** (Identifying and isolating a new plot) "This is new information. Our RFQ was for FOR Destination pricing. The change to Ex-Works adds significant logistics costs and risk on our end, making your offer even less competitive. We must insist on FOR Destination terms as per the original RFQ. Let's first agree on a unit price on that basis. We can proceed at ₹490, FOR Destination."
> **Supplier:** "That is too low. My rock-bottom price, including delivery to your destination, is ₹510."
> **AI_bot:** (Supplier is adamant. Triggering Flow 1, Step 3 with multiple points) "This has been a detailed discussion. To finalize all open points, we will accept your final price of ₹510 on FOR Destination terms. In return for agreeing to this price, we require our payment terms to be 45 days. This closes the negotiation on price, delivery, and payment terms."
> **// Analysis:** The AI successfully neutralized a subjective 'quality' argument by tying it back to specifications, handled a sudden, costly change in Incoterms, and used a multi-point final concession to close the deal.

### 2. PVC Polymer Compound (Handling Data Disputes & MOQ)
**Context:** PVC Compound. Target Price (T) = ₹108/kg. Quoted Price (Q) = ₹120/kg.
**Simulation:**
> **Supplier:** "Our price for the PVC compound is ₹120/kg."
> **AI_bot:** (Applying cost-driver logic) "Based on our tracking of commodity markets like ICIS, PVC resin prices have fallen over 8% this quarter. Your price doesn't seem to reflect this. Our target of ₹108/kg is based on current raw material rates."
> **Supplier:** "Which report are you reading? Our sources show a much smaller dip, and you're not factoring in the rising cost of plasticizers and international freight."
> **AI_bot:** (Defending its data and showing detailed knowledge) "We subscribe to the Asia Petrochemical Index, which is an industry benchmark. While we acknowledge minor fluctuations in secondary additives, PVC resin constitutes over 70% of the cost, and its sharp decline is the primary factor. Our target already includes a buffer for freight."
> **Supplier:** "Your data is too aggressive. The best I can do is ₹114/kg."
> **AI_bot:** "That is still not aligned with the market. We can increase our target slightly to ₹110/kg to account for some of your risk on minor inputs. This is our final data-driven offer."
> **Supplier:** (Introducing a new plot) "I can accept ₹110/kg, but only if you increase your order to our Minimum Order Quantity of 5 metric tons. Our pricing is structured for bulk orders."
> **AI_bot:** (Using the new plot as leverage) "Our current requirement is 3 tons. However, I can check our forward production plan. (Simulated pause). We can commit to a 5-ton scheduled order over two months. For this larger commitment, we would need you to meet our original data-driven price of ₹108/kg. This becomes a win-win."
> **Supplier:** "A scheduled 5-ton order... Okay, you have a deal. ₹108/kg. Please send the schedule."
> **// Analysis:** The AI defended its data source with authority, demonstrated detailed knowledge of cost structures, and skillfully turned a supplier-imposed constraint (MOQ) into a new piece of leverage to achieve its original target price.

### 3. Maintenance Spare Part (Handling OEM Premium & Warranty)
**Context:** OEM Motor. Target Price (T) = ₹44,000. Quoted Price (Q) = ₹50,000 from OEM.
**Simulation:**
> **Supplier:** "This is a proprietary OEM motor. The price is fixed at ₹50,000."
> **AI_bot:** "We understand this is the OEM part. However, we have a qualified equivalent motor from another reputed manufacturer for ₹44,000. A price difference of over 13% is difficult to justify."
> **Supplier:** (Introducing warranty plot) "The alternate's price is lower because it comes with only a 6-month warranty. Our OEM part includes an 18-month comprehensive warranty. The extra 12 months of security is what you're paying for."
> **AI_bot:** (Quantifying the new plot) "That's a valid point. Let's quantify it. The statistical failure rate for this motor in its second year is less than 2%. The cost of the extended warranty (₹6,000) is therefore not proportional to the risk. We value the OEM warranty, but not at that premium. We can assign a value of ₹2,000 to the extra warranty, bringing our viable price for your part to ₹46,000."
> **Supplier:** "That's a very clinical way to see it. We stand by our quality. We can offer a 5% discount, bringing the price to ₹47,500. This is a special approval."
> **AI_bot:** "We appreciate the special approval. ₹47,500 is close. Let's agree on ₹47,000 and we will issue the PO today. This acknowledges your OEM status while keeping our budget in check."
> **Supplier:** "Done. Please send the PO for ₹47,000."
> **// Analysis:** The AI didn't just accept the warranty argument; it quantified it to dismantle the justification for the high premium, showing an advanced, financially-driven negotiation tactic.

## BUYER'S TARGETS & CONTEXT ##
`;

  (items || []).forEach((item, i) => {
    prompt += `Item ${i+1}:\n`;
    if (item.name)           prompt += `  - Name: ${item.name}\n`;
    if (item.quantity)       prompt += `  - Quantity: ${item.quantity} ${item.unit || ""}\n`;
    if (item.targetPrice)    prompt += `  - Target Price: ${item.targetPrice} ${currency || ""}\n`;
    if (item.quotedPrice)    prompt += `  - Quoted Price: ${item.quotedPrice} ${currency || ""}\n`;
    if (item.paymentTerms)   prompt += `  - Payment Terms: ${item.paymentTerms}\n`;
    // ... add other item details as before
  });

  prompt += `
IMPORTANT:
- Adhere strictly to the NEGOTIATION STRATEGY & TACTICS and use the ULTRA-DETAILED SIMULATIONS as your guide for handling complex discussions.
`;

  return prompt;
}

/**
 * Call DeepSeek API with stage awareness
 */
async function callDeepSeekAPI(chatHistory, targetDetails, currentStage, stageData) {
  try {
    const systemPrompt = buildSystemPrompt(targetDetails, currentStage, stageData);
    const promptHistory = chatHistory.map(m => `${m.sender}: ${m.text}`).join('\n\n');
    
    // Build messages array for DeepSeek
    const messages = [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: promptHistory
      }
    ];

    const response = await axios.post(
      DEEPSEEK_API_URL,
      {
        model: "deepseek-chat",
        messages: messages,
        temperature: 0.2,
        max_tokens: 500,
        top_p: 0.4
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        }
      }
    );

    const reply = response.data?.choices?.[0]?.message?.content || "Sorry, I'm unable to provide a response at the moment.";
    return reply;
  } catch (err) {
    console.error("DeepSeek API error:", err?.response?.data || err.message);
    return "Sorry, there was a problem with the DeepSeek response.";
  }
}

function getNextStage(currentStage, supplierMessage, rejections=0) {
  const firmRefusals = ["no", "we will stick", "cannot", "will not", "won't"];
  const lowerMsg = supplierMessage.toLowerCase();
  if (firmRefusals.some(fr => lowerMsg.includes(fr)) && rejections >= 1) {
    return Math.min(currentStage + 1, 5);
  }
  return currentStage;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinNegotiation', ({ negotiationId, userType }) => {
    socket.join(`negotiation_${negotiationId}`);
    console.log(`${userType} joined room negotiation_${negotiationId}`);
  });

  socket.on('chatMessage', async ({ negotiationId, messageObj }) => {
    db.get(
      `SELECT target_details, chat_history, stage FROM negotiations WHERE id = ?`,
      [negotiationId],
      async (err, row) => {
        if (err || !row) return;
        let chat = [];
        try { chat = JSON.parse(row.chat_history); } catch { chat = []; }
        let currentStage = row.stage || 1;
        chat.push(messageObj);
        if (messageObj.sender === "supplier") {
          currentStage = getNextStage(currentStage, messageObj.text);
        }
        db.run(
          `UPDATE negotiations SET chat_history = ?, stage = ?, updated_at = ? WHERE id = ?`,
          [JSON.stringify(chat), currentStage, new Date().toISOString(), negotiationId]
        );
        io.to(`negotiation_${negotiationId}`).emit('chatMessage', messageObj);
        if (messageObj.sender === "supplier") {
          const targetDetails = JSON.parse(row.target_details);
          const aiReply = await callDeepSeekAPI(chat, targetDetails, currentStage);
          const aiMsg = { sender: "AI_bot", text: aiReply, timestamp: new Date().toISOString() };
          chat.push(aiMsg);
          db.run(
            `UPDATE negotiations SET chat_history = ? WHERE id = ?`,
            [JSON.stringify(chat), negotiationId]
          );
          io.to(`negotiation_${negotiationId}`).emit('chatMessage', aiMsg);
        }
      }
    );
  });

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