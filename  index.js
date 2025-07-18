const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());
const path = require("path");

// Serve static files from public/
app.use(express.static(path.join(__dirname, "public")));

// Optional: Handle root URL to return index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.post("/verify-receipt", async (req, res) => {
  const { receipt, device_id } = req.body;
  if (!receipt || !device_id) return res.status(400).send("Missing fields");

  const verifyWithApple = async (url) => {
    const response = await axios.post(url, {
      "receipt-data": receipt,
      "password": process.env.SHARED_SECRET,
    });
    return response.data;
  };

  let result = await verifyWithApple("https://buy.itunes.apple.com/verifyReceipt");
  if (result.status === 21007) {
    result = await verifyWithApple("https://sandbox.itunes.apple.com/verifyReceipt");
  }

  if (result.status !== 0) return res.status(400).json({ error: "Invalid receipt", result });

  const latest = result.latest_receipt_info?.slice(-1)[0];
  const isActive = latest && parseInt(latest.expires_date_ms) > Date.now();

  const originalTransactionId = latest?.original_transaction_id;

  // ✅ Connect to Supabase and mark is_pro = true
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  if (isActive) {
    await supabase.from("devices").upsert({
      device_id,
      is_pro: true,
      original_transaction_id: originalTransactionId,
      last_updated: new Date().toISOString(),
    });
  }

  return res.json({ is_pro: isActive });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));