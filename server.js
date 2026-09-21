const path = require("path");
const express = require("express");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const PORT = Number(process.env.PORT) || 8787;
const MONGODB_URI = process.env.MONGODB_URI || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const EVENT_DATE = "Saturday, June 19th, 2027";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

const hitsByIp = new Map();

function clientIp(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const max = 40;
  const current = (hitsByIp.get(ip) || []).filter(
    (time) => now - time < windowMs,
  );
  if (current.length >= max) {
    hitsByIp.set(ip, current);
    return true;
  }
  current.push(now);
  hitsByIp.set(ip, current);
  return false;
}

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function splitName(fullName) {
  const parts = fullName.split(" ").filter(Boolean);
  const firstName = parts[0] || "";
  const lastName = parts.slice(1).join(" ");
  return { firstName, lastName: lastName || firstName };
}

let collectionPromise;

async function rsvpsCollection() {
  if (!MONGODB_URI) {
    throw new Error("missing_uri");
  }
  if (!collectionPromise) {
    collectionPromise = (async () => {
      const client = new MongoClient(MONGODB_URI);
      await client.connect();
      const collection = client.db().collection("rsvps");
      await collection.createIndex(
        { firstNameLower: 1, lastNameLower: 1 },
        { unique: true },
      );
      return collection;
    })();
  }
  return collectionPromise;
}

app.post("/api/rsvp", async (req, res) => {
  if (rateLimited(clientIp(req))) {
    return res.status(429).json({ error: "Please wait and try again." });
  }

  const fullName = cleanText(req.body?.name, 120);
  const split = splitName(fullName);
  const firstName = cleanText(req.body?.firstName, 80) || split.firstName;
  const lastName = cleanText(req.body?.lastName, 80) || split.lastName;
  const attending = req.body?.attending === true;
  const rawGuests = Array.isArray(req.body?.guests) ? req.body.guests : [];

  if (!firstName || !lastName) {
    return res.status(400).json({ error: "Your name is required." });
  }

  const displayName =
    fullName ||
    (firstName === lastName ? firstName : firstName + " " + lastName);

  let guests = [];
  let partySize = 0;
  if (attending) {
    guests = rawGuests
      .slice(0, 12)
      .map((guest) => {
        if (typeof guest === "string") {
          return { name: cleanText(guest, 80) };
        }
        return { name: cleanText(guest?.name, 80) };
      })
      .filter((guest) => guest.name);
    if (!guests.length) {
      guests = [{ name: displayName }];
    }
    partySize = guests.length;
  }

  const doc = {
    name: displayName,
    firstName,
    lastName,
    firstNameLower: firstName.toLowerCase(),
    lastNameLower: lastName.toLowerCase(),
    attending,
    partySize,
    guests,
    eventDate: EVENT_DATE,
    updatedAt: new Date(),
  };

  try {
    const collection = await rsvpsCollection();
    await collection.updateOne(
      { firstNameLower: doc.firstNameLower, lastNameLower: doc.lastNameLower },
      { $set: doc, $setOnInsert: { createdAt: new Date() } },
      { upsert: true },
    );
    return res.json({ ok: true });
  } catch (error) {
    if (error.message === "missing_uri") {
      return res.status(503).json({
        error: "RSVP storage is not configured yet.",
      });
    }
    console.error(error);
    return res.status(500).json({ error: "Could not save your RSVP." });
  }
});

app.get("/api/rsvps", async (req, res) => {
  if (!ADMIN_KEY || req.get("x-admin-key") !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  try {
    const collection = await rsvpsCollection();
    const rsvps = await collection
      .find({}, { projection: { firstNameLower: 0, lastNameLower: 0 } })
      .sort({ updatedAt: -1 })
      .toArray();
    return res.json({ rsvps });
  } catch (error) {
    if (error.message === "missing_uri") {
      return res.status(503).json({
        error: "RSVP storage is not configured yet.",
      });
    }
    console.error(error);
    return res.status(500).json({ error: "Could not load RSVPs." });
  }
});

if (process.env.NODE_ENV === "production") {
  const dist = path.join(__dirname, "dist");
  app.use(express.static(dist));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "Not found." });
    }
    return res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log("RSVP API listening on http://127.0.0.1:" + PORT);
  if (!MONGODB_URI) {
    console.log("Set MONGODB_URI in .env to save RSVPs.");
  }
});
