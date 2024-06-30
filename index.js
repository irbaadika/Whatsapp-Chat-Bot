const {
  default: makeWASocket,
  MessageType,
  MessageOptions,
  Mimetype,
  DisconnectReason,
  BufferJSON,
  AnyMessageContent,
  delay,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  makeCacheableSignalKeyStore,
  makeInMemoryStore,
  MessageRetryMap,
  useMultiFileAuthState,
  msgRetryCounterMap,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const axios = require("axios");
const express = require("express");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const bodyParser = require("body-parser");
const { Boom } = require("@hapi/boom");
const app = require("express")();
// Enable files upload
app.use(
  fileUpload({
    createParentPath: true,
  })
);

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const server = require("http").createServer(app);
const io = require("socket.io")(server);
const port = process.env.PORT || 5000;
const qrcode = require("qrcode");

app.use("/assets", express.static(__dirname + "/client/assets"));

app.get("/scan", (req, res) => {
  res.sendFile("./client/index.html", {
    root: __dirname,
  });
});

app.get("/", (req, res) => {
  res.send("server working");
});

let socket;
let qrDinamic;
let soket;

async function startWhatsAppBot() {
  try {
    const auth = await useMultiFileAuthState("session");
    const socket = makeWASocket({
      printQRInTerminal: true,
      browser: ["WA Bot", "", ""],
      auth: auth.state,
      logger: pino({ level: "silent" }),
    });

    socket.ev.on("creds.update", auth.saveCreds);
    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;
      qrDinamic = qr;
      if (connection === "close") {
        const reason = new Boom(lastDisconnect.error).output.statusCode;
        if (reason === DisconnectReason.badSession) {
          console.log("Bad Session File, Please Delete session and Scan Again");
          socket.logout();
        } else if (reason === DisconnectReason.connectionClosed) {
          console.log("Connection closed, reconnecting...");
          startWhatsAppBot();
        } else if (reason === DisconnectReason.connectionLost) {
          console.log("Connection lost, reconnecting...");
          startWhatsAppBot();
        } else if (reason === DisconnectReason.connectionReplaced) {
          console.log(
            "Connection replaced, another session opened, logging out current session"
          );
          socket.logout();
        } else if (reason === DisconnectReason.loggedOut) {
          console.log(
            "Device logged out, please delete session and scan again."
          );
          socket.logout();
        } else if (reason === DisconnectReason.restartRequired) {
          console.log("Restart required, restarting...");
          startWhatsAppBot();
        } else if (reason === DisconnectReason.timedOut) {
          console.log("Connection timed out, connecting...");
          startWhatsAppBot();
        } else {
          socket.end(
            `Unknown disconnect reason: ${reason} | ${lastDisconnect.error}`
          );
        }
      } else if (connection === "open") {
        console.log("Connection open");
        return;
      }
    });

    let productData = [];
    const user = socket.user;
    const phoneNumber = user.id.split(":")[0];
    const baseUrl = "http://local.web-whisper-update.test";
    const endpoint = `http://local.web-whisper-update.test/api/${phoneNumber}/products`;

    const carts = {};
    const paymentLock = {};

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
      if (!carts[userId]) {
        carts[userId] = [];
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

          paymentLock[transactionCode] = true;

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
            delete paymentLock[transactionCode];
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
            const rateUrl = `https://38db-182-4-134-129.ngrok-free.app/rate/${transactionCode.toUpperCase()}`;
            await socket.sendMessage(chat.key.remoteJid, {
              text: `Silahkan klik tautan di bawah ini untuk melakukan penilaian pada produk yang anda pesan\n\n${rateUrl}`,
            });
          }
        } catch (error) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Format yang anda masukkan salah!",
          });
        }
      }
      // TAMPILKAN MENU
      else if (pesan === "!menu") {
        try {
          const response = await axios.get(
            `${baseUrl}/api/${phoneNumber}/products`
          );
          productData = response.data.products;

          if (productData.length > 0) {
            // Group produk berdasarkan kategori
            const groupedProducts = {};
            productData.forEach((product) => {
              if (!groupedProducts[product.category]) {
                groupedProducts[product.category] = [];
              }
              groupedProducts[product.category].push(product);
            });

            let productNames = "";
            // Tampilkan menu berdasarkan kategori
            Object.keys(groupedProducts).forEach((category) => {
              productNames += `MENU ${category.toUpperCase()}\n\n`;
              productNames += groupedProducts[category]
                .map((product) => {
                  if (product.variant_name) {
                    return `${product.name} ${product.variant_name} - Rp. ${
                      product.price
                    }\n    \`\`\`!${product.name
                      .toLowerCase()
                      .replace(/\s/g, "")}${product.variant_name
                      .toLowerCase()
                      .replace(/\s/g, "")}\`\`\``;
                  } else {
                    return `${product.name} - Rp. ${
                      product.price
                    }\n    \`\`\`!${product.name
                      .toLowerCase()
                      .replace(/\s/g, "")}\`\`\``;
                  }
                })
                .join("\n\n");
              productNames += "\n\n";
            });

            await socket.sendMessage(chat.key.remoteJid, {
              text: `\*MENU\*\n\n${productNames}\n\n\*Cara pesan\*\n> Pesan 1 menu :\n> \`\`\`    !bakso\`\`\`\n> Pesan 1 menu jumlah banyak :\n> \`\`\`    !bakso/2\`\`\`\n> Pesan beberapa menu :\n> \`\`\`    !bakso/2,!mie\`\`\``,
            });
          } else {
            await socket.sendMessage(chat.key.remoteJid, {
              text: "Failed to fetch product data.",
            });
          }
        } catch (error) {
          console.error(
            "Error fetching data from Laravel endpoint:",
            error.response
          );
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Failed to fetch product data. Please try again later.",
          });
        }
      }
      // PESAN MENU LAGI
      else if (pesan === "!pesanlagi") {
        await socket.sendMessage(chat.key.remoteJid, {
          text: "Silakan pilih menu dan jumlah pesanan lagi.",
        });
      }
      // CHECKOUT
      else if (pesan === "!checkout") {
        let orderDetails = "Pesanan Anda:\n";
        let totalCost = 0;
        for (const item of carts[userId]) {
          const product = productData.find((p) => p.id === item.product_id);
          if (product) {
            const subtotal = product.price * item.quantity;
            orderDetails += `${item.quantity} ${product.name} ${product.variant_name} - Rp. ${subtotal}\n`;
            totalCost += subtotal;
          }
        }
        orderDetails += `Total Rp. ${totalCost}\n\nAnda yakin ingin memesan?\n\`\`\`    !yakin\`\`\``;
        await socket.sendMessage(chat.key.remoteJid, {
          text: orderDetails,
        });
      }
      // CHECKOUT #2
      else if (pesan === "!yakin") {
        await socket.sendMessage(chat.key.remoteJid, {
          text: `Jika anda yakin dengan pesanan anda maka ketikkan\n\`\`\` !pesan@nama@alamat\`\`\`\n\nContoh\n> !pesan@Irba@Jalan Mawar No.1`,
        });
      }
      // BAYAR JIKA PESAN MELALUI CHAT
      else if (pesan.startsWith("!pesan")) {
        const [, name, address] = pesan.split("@");
        const customerPhoneNumber = chat.key.remoteJid.split("@")[0];
        if (!name || !address) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Format pesanan salah. Silakan coba lagi.",
          });
          return;
        }
        if (carts[userId].length === 0) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Mohon maaf, pesanan Anda belum ada karena keranjang belanja masih kosong.",
          });
          return;
        } else {
          const order = {
            name: name.trim(),
            phone_number: customerPhoneNumber,
            address: address.trim(),
            products: carts[userId],
          };
          try {
            const response = await axios.post(
              `${baseUrl}/api/customer/transaction`,
              order
            );
            const transactionCode = response.data.result.code;
            await socket.sendMessage(chat.key.remoteJid, {
              text: `Pesanan Anda berhasil dibuat dengan kode:`,
            });
            await socket.sendMessage(chat.key.remoteJid, {
              text: `${transactionCode}`,
            });
            carts[userId] = [];

            // payment midtrans
            paymentLock[transactionCode] = true;

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
              delete paymentLock[transactionCode];
            }
          } catch (error) {
            console.log(error.response.data);
            await socket.sendMessage(chat.key.remoteJid, {
              text: `Gagal memesan. Silakan coba lagi nanti.${name}`,
            });
          }
        }
      }
      // KOSONGKAN KERANJANG
      else if (pesan === "!kosongkankeranjang") {
        carts[userId] = []; // Clear the cart for this user
        await socket.sendMessage(chat.key.remoteJid, {
          text: `Keranjang anda berhasil dikosongkan`,
        });
      }
      // BAYAR MELALUI KODE TRANSAKSI
      else if (pesan.startsWith("!bayar")) {
        const [, transaction_id] = pesan.split("@");
        if (!transaction_id) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Format pesanan salah. Silakan coba lagi.",
          });
          return;
        }
        if (paymentLock[transaction_id]) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Permintaan pembayaran sedang diproses. Mohon tunggu sebentar.",
          });
          return;
        }

        // payment midtrans
        paymentLock[transaction_id] = true;
        try {
          const payment = {
            transaction_id: transaction_id.toUpperCase(),
          };
          const response = await axios.post(
            `${baseUrl}/api/customer/transaction/payment`,
            payment
          );
          const snapToken = response.data.payment_url;
          // Mengirim pesan kedua
          await socket.sendMessage(chat.key.remoteJid, {
            text: `${snapToken}`,
          });
        } catch (error) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: `Gagal Silakan coba lagi nanti.${error.response.data}`,
          });
          console.log(error.response.data);
        } finally {
          // Release the lock after processing is complete
          delete paymentLock[transaction_id];
        }
      }
      // PERINTAH TAMBAH MENU
      else {
        const orders = pesan.split(",");
        let orderUpdated = false;
        // cocokkan dengan perintah menu
        for (const orderText of orders) {
          const match = orderText.match(/^!(\w+)(?:\/(\d+))?$/);
          if (match) {
            const productName = match[1];
            const quantity = match[2] ? parseInt(match[2], 10) : 1;
            // produk dengan input > 0 yang dihitung masuk keranjang
            if (quantity > 0) {
              const product = productData.find((product) => {
                const formattedProductName = product.name
                  .toLowerCase()
                  .replace(/\s/g, "");
                // produk jika ada variant
                if (product.variant_name) {
                  const formattedVariantName = product.variant_name
                    .toLowerCase()
                    .replace(/\s/g, "");
                  return (
                    formattedProductName + formattedVariantName === productName
                  );
                } else {
                  return formattedProductName === productName;
                }
              });

              if (product) {
                const existingItemIndex = carts[userId].findIndex(
                  (item) => item.product_id === product.id
                );
                if (existingItemIndex !== -1) {
                  carts[userId][existingItemIndex].quantity += quantity;
                } else {
                  carts[userId].push({
                    product_id: product.id,
                    quantity: quantity,
                  });
                }
                orderUpdated = true;
              } else {
                await socket.sendMessage(chat.key.remoteJid, {
                  text: `Perintah ${productName} tidak ditemukan.\n\nSilahkan ketik perintah dibawah untuk bantuan menggunakan chatbot\n> !help`,
                });
                return;
              }
            }
          }
        }
        // update menu
        if (orderUpdated) {
          let orderDetails = "Pesanan Anda:\n";
          let totalCost = 0;
          for (const item of carts[userId]) {
            const product = productData.find((p) => p.id === item.product_id);
            if (product) {
              const subtotal = product.price * item.quantity;
              orderDetails += `${item.quantity} ${product.name} ${product.variant_name} - Rp. ${subtotal}\n`;
              totalCost += subtotal;
            }
          }
          orderDetails += `Total Rp. ${totalCost}\n\nAnda ingin memesan menu lagi?\n\`\`\`    !pesanlagi\`\`\`\n\nAnda ingin lanjut checkout?\n\`\`\`    !checkout\`\`\``;
          await socket.sendMessage(chat.key.remoteJid, {
            text: orderDetails,
          });
        }
      }
    });
  } catch (error) {
    console.error("Error starting WhatsApp bot:", error);
  }
}

startWhatsAppBot();

const isConnected = () => {
  return socket?.user ? true : false;
};

app.get("/send-message", async (req, res) => {
  const tempMessage = req.query.message;
  const number = req.query.number;

  let numberWA;
  try {
    if (!number) {
      res.status(500).json({
        status: false,
        response: "Number Not Found!",
      });
    } else {
      numberWA = "62" + number + "@s.whatsapp.net";

      if (isConnected()) {
        const exist = await socket.onWhatsApp(numberWA);

        if (exist?.jid || (exist && exist[0]?.jid)) {
          socket
            .sendMessage(exist.jid || exist[0].jid, {
              text: tempMessage,
            })
            .then((result) => {
              res.status(200).json({
                status: true,
                response: result,
              });
            })
            .catch((err) => {
              res.status(500).json({
                status: false,
                response: err,
              });
            });
        }
      } else {
        res.status(500).json({
          status: false,
          response: "Not Connected",
        });
      }
    }
  } catch (err) {
    res.status(500).send(err);
  }
});

io.on("connection", async (socket) => {
  soket = socket;
  if (isConnected()) {
    updateQR("connected");
  } else if (qrDinamic) {
    updateQR("qr");
  }
});

const updateQR = (data) => {
  switch (data) {
    case "qr":
      qrcode.toDataURL(qrDinamic, (err, url) => {
        soket?.emit("qr", url);
        soket?.emit("log", "You get QR, scan now");
      });
      break;
    case "connected":
      soket?.emit("qrstatus", "./assets/check.svg");
      soket?.emit("log", " User is :");
      const { id, name } = socket?.user;
      var userinfo = id + " " + name;
      soket?.emit("user", userinfo);

      break;
    case "loading":
      soket?.emit("qrstatus", "./assets/loader.gif");
      soket?.emit("log", "Please wait...");

      break;
    default:
      break;
  }
};

startWhatsAppBot().catch((err) => console.log("unexpected error: " + err)); // catch any errors
server.listen(port, () => {
  console.log("Server Run Port : " + port);
});
