const {
  makeWASocket,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const pino = require("pino");

async function connectWhatsApp() {
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
    } else if (connection === "close") {
      await connectWhatsApp();
      console.log("gagal");
    }
  });

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    const chat = messages[0];
    const remoteJid = chat.key.remoteJid;
    console.log("Received a message from:", remoteJid);
    const pesan =
      (
        chat.message?.extendedTextMessage?.text ??
        chat.message?.ephemeralMessage?.message?.extendedTextMessage?.text ??
        chat.message?.conversation
      )?.toLowerCase() || "";

    if (pesan.toLowerCase() == "tampilkan menu") {
      await socket.sendMessage(chat.key.remoteJid, {
        text: "Menu Kami \n ▪ Ayam Crispy \n ▪ Bakso Urat \n ▪ Mie Ayam",
      });
    } else if (pesan.toLowerCase() == "ayam crispy") {
      await socket.sendMessage(chat.key.remoteJid, {
        text: "Ayam Crispy \n Rp.15.000 \n Apakah Anda ingin memesan ini? Ketik 'ya' atau 'tidak'.",
      });
    } else if (pesan.toLowerCase() == "bakso urat") {
      await socket.sendMessage(chat.key.remoteJid, {
        text: "Bakso Urat. \n Rp.20.000 \n Apakah Anda ingin memesan ini? Ketik 'ya' atau 'tidak'.",
      });
    } else if (pesan.toLowerCase() == "mie ayam") {
      await socket.sendMessage(chat.key.remoteJid, {
        text: "Mie Ayam. \n Rp.16.000 \n Apakah Anda ingin memesan ini? Ketik 'ya' atau 'tidak'.",
      });
    } else if (pesan.toLowerCase() == "ya") {
      await socket.sendMessage(chat.key.remoteJid, {
        text: "Pesanan Berhasil Dibuat. \nSilakan Pilih Metode Pembayaran. \n 1. QRIS \n 2. Transfer \n 3. Dana \n\n Pilih pembayaran dengan inputkan nomor metode pembayaran!",
      });
    } else if (pesan == "1") {
      await socket.sendMessage(chat.key.remoteJid, {
        text: "Pesanan Anda \n Ayam Crispy \n dengan harga Rp.15.000 \n berikut link pembayaran \n http://www.google.com",
      });
    } else if (pesan == "2") {
      await socket.sendMessage(chat.key.remoteJid, {
        text: "Pesanan Anda \n Bakso Urat \n dengan harga Rp.20.000 \n berikut link pembayaran \n http://www.google.com",
      });
    } else if (pesan == "3") {
      await socket.sendMessage(chat.key.remoteJid, {
        text: "Pesanan Anda \n Mie Ayam \n dengan harga Rp.16.000 \n berikut link pembayaran \n http://www.google.com",
      });
    } else if (pesan.toLowerCase() == "tidak") {
      await socket.sendMessage(chat.key.remoteJid, {
        text: "Baik, pesanan Anda telah dibatalkan. Apakah ada yang bisa saya bantu lagi?",
      });
    } else if (pesan.toLowerCase().startsWith("hi, admin")) {
      await socket.sendMessage(chat.key.remoteJid, {
        text: "Tutorial menggunakan bot\n\n> jika muncul tanda ▪ maka ketikkan apa yang sama dengan menu yang kalian pilih tidak peduli huruf besar atau kecil namun jika ada spasi harus sama dengan salah satu contoh kaian ingin memilih menu di bawah \n> ▪ Tampilkan Menu\n> maka kalian harus mengetikkan 'tampilkan menu' \n\n=== MENU === \n▪ Tampilkan Menu \n▪ Lihat Status Pesanan \n▪ Chat Langsung dengan Admin",
      });
    } else if (pesan.toLowerCase() == "lihat status pesanan") {
      await socket.sendMessage(chat.key.remoteJid, {
        text: "Pesanan Anda sedang diantar! Mohon Tunggu",
      });
    } else if (pesan.toLowerCase() == "chat langsung dengan admin") {
      await socket.sendMessage(chat.key.remoteJid, {
        text: "Sebentar lagi kamu akan terputus dengan chat bot dan akan bisa chat secara langsung dengan admin",
      });
    } else if (pesan.toLowerCase() == "woi") {
      await socket.sendMessage(chat.key.remoteJid, {
        text: remoteJid,
      });
    }
  });
}
connectWhatsApp();
