import express from "express";
import Stripe from "stripe";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.use(cors());
app.use(express.json());

// 🧠 Prevent duplicate Stripe events
const processedEvents = new Set();

/**
 * ✅ Create Checkout Session
 */
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { name, email } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: "Booking Service" },
            unit_amount: 5000
          },
          quantity: 1
        }
      ],
      success_url: "https://your-horizons-site.com/success",
      cancel_url: "https://your-horizons-site.com/cancel",
      metadata: { name }
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Stripe session failed" });
  }
});

/**
 * ⚡ Stripe Webhook (FAST + SAFE)
 */
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.log("Webhook error:", err.message);
    return res.sendStatus(400);
  }

  // ✅ Respond immediately (prevents overload)
  res.sendStatus(200);

  // 🔒 Idempotency
  if (processedEvents.has(event.id)) return;
  processedEvents.add(event.id);

  // 🎯 Handle payment success
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const email = session.customer_details.email;
    const name = session.metadata.name;

    console.log("Booking confirmed:", email);

    sendEmail(email, name);
  }
});

/**
 * 📧 Email sender
 */
async function sendEmail(to, name) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: "Booking Confirmed",
    text: `Hi ${name}, your booking is confirmed.`
  });
}

app.listen(process.env.PORT || 10000, () => {
  console.log("Server running");
});