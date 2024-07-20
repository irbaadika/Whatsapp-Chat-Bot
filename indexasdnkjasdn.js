const express = require("express");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// Simpan sesi dalam memori untuk contoh ini, gunakan database untuk produksi
const sessions = {};

const startSock = async (sessionName) => {
  const { state, saveCreds } = await useMultiFileAuthState(sessionName);
  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      if (
        lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
      ) {
        startSock(sessionName); // Reconnect if not logged out
      } else {
        console.log(`Connection closed. You are logged out. - ${sessionName}`);
        delete sessions[sessionName]; // Remove session from memory
      }
    } else if (connection === "open") {
      console.log(`Connected - ${sessionName}`);
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    console.log(JSON.stringify(m, undefined, 2));

    // Check if the message is from a user and is a text message
    const message = m.messages[0];
    if (!message.key.fromMe && message.message?.conversation === "ping") {
      const user = sock.user;
      const phoneNumber = user.id.split(":")[0];
      const from = message.key.remoteJid;
      const replyText = `hai ini dari ${phoneNumber}`;

      // Send message
      await sock.sendMessage(from, { text: replyText });
    }
  });

  sessions[sessionName] = sock;
};

app.get("/start-session", async (req, res) => {
  const sessionId = `session_${Date.now()}`; // Generate unique session ID
  await startSock(sessionId);
  res.send({ message: `Session started: ${sessionId}`, sessionId });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
