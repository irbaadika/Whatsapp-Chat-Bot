const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const axios = require("axios");
const express = require("express");
const app = express();
const path = require("path");

const port = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Menyimpan informasi sesi dan koneksi
const sessions = {};

// Endpoint untuk mendapatkan QR Code
app.get("/qr-code/:session", (req, res) => {
  const { session } = req.params;
  if (sessions[session] && sessions[session].qrCode) {
    res.json({ qrCode: sessions[session].qrCode });
  } else {
    res.status(404).json({ error: "QR Code not found" });
  }
});

// Endpoint untuk mendapatkan status koneksi
app.get("/status/:session", (req, res) => {
  const { session } = req.params;
  if (sessions[session] && sessions[session].isConnected) {
    res.json({
      connected: true,
      name: sessions[session].userName,
      phone: sessions[session].userPhoneNumber,
    });
  } else {
    res.json({ connected: false });
  }
});

async function startWhatsAppBot(session) {
  try {
    // Menggunakan MultiFileAuthState untuk menangani sesi
    const auth = await useMultiFileAuthState(`session_${session}`);
    const socket = makeWASocket({
      printQRInTerminal: true,
      browser: ["WA Bot", "", ""],
      auth: auth.state,
      logger: pino({ level: "silent" }),
    });

    sessions[session] = {
      qrCode: "",
      isConnected: false,
      userName: "",
      userPhoneNumber: "",
      socket,
      carts: {},
      paymentLock: {},
    };

    socket.ev.on("creds.update", auth.saveCreds);
    socket.ev.on(
      "connection.update",
      async ({ connection, lastDisconnect, qr }) => {
        if (connection === "open") {
          sessions[session].isConnected = true;
          sessions[session].userName = socket.user.name;
          sessions[session].userPhoneNumber = socket.user.id.split(":")[0];
          console.log(`WA Bot (${session}) Ready! 🎄🎋🎍🎎🎏`);
        } else if (connection === "close") {
          sessions[session].isConnected = false;
          sessions[session].userName = "";
          sessions[session].userPhoneNumber = "";
          console.log(
            `Connection closed for session ${session}. Restarting...`
          );
          delete sessions[session]; // Remove the session
          await startWhatsAppBot(session); // Restart for the same session
        }
        if (qr) {
          sessions[session].qrCode = qr;
        }
      }
    );

    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      const chat = messages[0];
      const userId = chat.key.remoteJid;

      // Batasi chat group
      const isGroup = userId.includes("@g.us");
      if (isGroup) {
        return;
      }

      const pesan =
        chat.message?.extendedTextMessage?.text ??
        chat.message?.ephemeralMessage?.message?.extendedTextMessage?.text ??
        chat.message?.conversation;

      // Batasi cart per user id
      if (!sessions[session].carts[userId]) {
        sessions[session].carts[userId] = [];
      }

      // BAYAR JIKA PESAN MELALUI WEBSITE
      if (pesan.startsWith("Hi, Admin")) {
        const transactionCodeMatch = pesan.match(/TRX-P\d{14}/);
        const customerNameMatch = pesan.match(/Customer Name: ([^\n]+)/);

        if (transactionCodeMatch && customerNameMatch) {
          const transactionCode = transactionCodeMatch[0];
          const customerName = customerNameMatch[1];

          await socket.sendMessage(chat.key.remoteJid, {
            text: `Hi, ${customerName}, Pesanan kamu dengan kode ${transactionCode} berhasil dibuat`,
          });

          sessions[session].paymentLock[transactionCode] = true;

          const payment = {
            transaction_id: transactionCode.toUpperCase(),
          };

          try {
            const response = await axios.post(
              `${baseUrl}/api/customer/transaction/payment`,
              payment
            );
            const snapToken = response.data.payment_url;
            // Mengirim pesan ketiga
            await socket.sendMessage(chat.key.remoteJid, {
              text: `Silahkan lakukan pembayaran dengan menekan tautan berikut ini:\n${snapToken}`,
            });
          } catch (error) {
            await socket.sendMessage(chat.key.remoteJid, {
              text: `Gagal mendapatkan kode pembayaran, silahkan lakukan kembali dengan mengetikkan\n\`\`\`!bayar@t\`\`\`\n> !bayar@TRX-2000000000`,
            });
            console.log(error.response.data);
          } finally {
            // Release the lock for this transaction_id
            delete sessions[session].paymentLock[transactionCode];
          }
        } else {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Maaf, nomor transaksi atau nama pelanggan tidak ditemukan.",
          });
        }
      }
      // HELP
      else if (pesan === "!help") {
        await socket.sendMessage(chat.key.remoteJid, {
          text: "*TUTORIAL MENGGUNAKAN BOT*\n\n> Ketikkan ! di awal untuk menjalankan perintah sesuai dengan yang disediakan\n\nTampilkan Menu\n```    !menu```\n\nKosongkan Keranjang\n```    !kosongkankeranjang```\n\nLacak Paket\n```    !track@kodetransaksi```",
        });
      }
      // LACAK PESANAN
      else if (pesan.startsWith("!track")) {
        const [, transactionCode] = pesan.split("@");
        if (!transactionCode) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Format pesanan salah. Silakan coba lagi.",
          });
          return;
        }
        try {
          const response = await axios.get(
            `${baseUrl}/api/track/${transactionCode}`
          );
          const { order, transactionNow } = response.data;
          const orderStatus = order.order_status;
          const sender = transactionNow.sender;
          const customer = transactionNow.payment_by;
          const updatedAt = new Date(order.updated_at).toLocaleString("id-ID", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "numeric",
            minute: "numeric",
          });
          let statusMessage = "";
          switch (orderStatus) {
            case "Pending":
              statusMessage = "> Belum dibayar";
              break;
            case "Confirmed":
              statusMessage = "> Sedang Dikemas";
              break;
            case "Shipped":
              statusMessage = `> Sedang dikirim\n\nInformasi Pengirim\nPengirim: ${sender.name}\nNo HP: 0${sender.phone_number}`;
              break;
            case "Fullfilled":
              statusMessage = `> Sudah Diterima\n\nInformasi Penerima\nPenerima: ${customer.name}\nAlamat: ${customer.address}\npada ${updatedAt}\n\nAnda bisa melakukan rating produk kami dengan\n\`\`\`    !rate@kodetransaksi\`\`\``;
              break;
            default:
              break;
          }
          await socket.sendMessage(chat.key.remoteJid, {
            text: `Status pesanan untuk kode transaksi ${transactionCode.toUpperCase()}\n\n${statusMessage}`,
          });
        } catch (error) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Terjadi kesalahan saat melakukan pelacakan. Silakan coba lagi nanti.",
          });
        }
      }
      // RATING PESANAN
      else if (pesan.startsWith("!rate")) {
        const [, transactionCode] = pesan.split("@");
        if (!transactionCode) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Format pesanan salah. Silakan coba lagi.",
          });
          return;
        }
        try {
          const response = await axios.get(
            `${baseUrl}/api/track/${transactionCode}`
          );
          const { order } = response.data;
          if (order.order_status !== "Fullfilled") {
            await socket.sendMessage(chat.key.remoteJid, {
              text: `Penilaian produk gagal, pesanan yang anda cari tidak ditemukan!`,
            });
          } else {
            // const rateUrl = `${baseUrl}/rate/${transactionCode.toUpperCase()}`;
            const rateUrl = `https://38db-182-4-248-155.ngrok-free.app/rate/${transactionCode.toUpperCase()}`;
            await socket.sendMessage(chat.key.remoteJid, {
              text: `Silahkan beri rating untuk pesanan kamu di tautan ini: ${rateUrl}`,
            });
          }
        } catch (error) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Terjadi kesalahan saat melakukan pelacakan. Silakan coba lagi nanti.",
          });
        }
      }
      // SHOW MENU
      else if (pesan === "!menu") {
        await socket.sendMessage(chat.key.remoteJid, {
          text: "*MENU*\n\n`!track@kode_transaksi`\n> Melacak status pesanan\n\n`!help`\n> Menampilkan bantuan untuk menggunakan bot\n\n`!rate@kode_transaksi`\n> Menilai pesanan setelah diterima\n\n*Silakan pilih salah satu menu di atas*",
        });
      }
    });

    console.log(`Starting WhatsApp Bot for session ${session}`);
  } catch (error) {
    console.error(
      `Failed to start WhatsApp Bot for session ${session}:`,
      error
    );
    setTimeout(() => startWhatsAppBot(session), 5000); // Restart after 5 seconds on failure
  }
}

// Mulai sesi untuk beberapa session
const sessionsList = ["session1", "session2"]; // Tambahkan nama sesi sesuai kebutuhan
sessionsList.forEach(startWhatsAppBot);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
