const {
  makeWASocket,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const mysql = require("mysql");

const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "web-whisper-update",
});

connection.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL database:", err);
    return;
  }
  console.log("Connected to MySQL database!");
});

connection.query(
  "SELECT p.* FROM products p JOIN users u ON p.vendor_id = u.vendor_id WHERE u.phone_number = '62895342093342';",
  async (error, products, fields) => {
    if (error) throw error;
    console.log("Hasil query products:", products);
    await connectWhatsApp(products);
  }
);

async function connectWhatsApp(products) {
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
      await connectWhatsApp(products);
      console.log("gagal");
    }
  });

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    const chat = messages[0];
    const pesan =
      (
        chat.message?.extendedTextMessage?.text ??
        chat.message?.ephemeralMessage?.message?.extendedTextMessage?.text ??
        chat.message?.conversation
      )?.toLowerCase() || "";

    // Membuat array untuk menyimpan pesan balasan
    let replyMessages = [];

    // Variabel untuk melacak apakah pengguna telah memilih produk
    let productSelected = false;

    // Periksa pesan pengguna untuk menentukan tindakan yang tepat
    if (pesan.toLowerCase() === "tampilkan menu") {
      // Tampilkan menu produk
      const menuText =
        "Menu Kami \n" +
        products.map((product) => `▪ ${product.name}`).join("\n");
      replyMessages.push({ text: menuText });
    }

    // Jika pengguna telah memilih produk
    if (productSelected) {
      if (pesan.toLowerCase() === "pesan menu lain") {
        // Pengguna ingin memesan menu lain
        productSelected = false; // Reset variabel productSelected
        // Tampilkan kembali menu produk
        const menuText =
          "Menu Kami \n" +
          products.map((product) => `▪ ${product.name}`).join("\n");
        replyMessages.push({ text: menuText });
      } else if (pesan.toLowerCase() === "lanjut checkout") {
        // Pengguna ingin melanjutkan checkout
        replyMessages.push({ text: "Lanjutkan ke proses checkout..." });
        // Lakukan proses checkout disini
      }
    }

    // Cari produk yang sesuai dengan pesan pengguna
    const requestedProduct = products.find(
      (product) => pesan.toLowerCase() === product.name.toLowerCase()
    );

    // Jika produk yang diminta ditemukan
    if (requestedProduct && !productSelected) {
      replyMessages.push({
        text: `${requestedProduct.name} \n Rp.${requestedProduct.price} \n Apakah Anda ingin memesan ini? Ketik 'pesan menu lain' untuk memesan menu lain atau 'lanjut checkout' untuk melanjutkan ke checkout.`,
      });
      // Set variabel productSelected menjadi true
      productSelected = true;
    }

    // Kirim pesan balasan
    for (const message of replyMessages) {
      await socket.sendMessage(chat.key.remoteJid, message);
    }
  });
}
