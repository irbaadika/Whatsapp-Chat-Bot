const {
  makeWASocket,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const axios = require("axios");

async function fetchDataFromLaravelEndpoint(endpoint) {
  try {
    const response = await axios.get(endpoint);
    return response.data;
  } catch (error) {
    console.error("Error fetching data from Laravel endpoint:", error);
    throw error;
  }
}

async function startWhatsAppBot() {
  let phoneNumber;
  try {
    const auth = await useMultiFileAuthState("session");
    const socket = makeWASocket({
      printQRInTerminal: true,
      browser: ["WA Bot", "", ""],
      auth: auth.state,
      logger: pino({ level: "silent" }),
    });

    socket.ev.on("creds.update", auth.saveCreds);
    socket.ev.on("connection.update", async ({ connection }) => {
      if (connection === "open") {
        console.log("WA Bot Ready!🎄🎋🎍🎎🎏");
        const user = socket.user;
        phoneNumber = user.id.split(":")[0];
        console.log("Logged in as:", phoneNumber);
      } else if (connection === "close") {
        await startWhatsAppBot();
        console.log("gagal");
      }
    });

    console.log(phoneNumber);
    // const data = await fetchDataFromLaravelEndpoint(
    //   `http://local.web-whisper-update.test/${phoneNumber}/products`
    // );
    // console.log(data.data.message);

    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      const chat = messages[0];
      const pesan =
        (
          chat.message?.extendedTextMessage?.text ??
          chat.message?.ephemeralMessage?.message?.extendedTextMessage?.text ??
          chat.message?.conversation
        )?.toLowerCase() || "";

      // Logika untuk menangani pesan dari pengguna
    });
  } catch (error) {
    console.error("Error starting WhatsApp bot:", error);
  }
}

startWhatsAppBot();
