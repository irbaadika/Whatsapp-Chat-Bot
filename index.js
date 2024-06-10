const {
  makeWASocket,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const axios = require("axios");

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
    socket.ev.on("connection.update", async ({ connection }) => {
      if (connection === "open") {
        console.log("WA Bot Ready!🎄🎋🎍🎎🎏");
      } else if (connection === "close") {
        await startWhatsAppBot();
        console.log("Connection closed. Restarting...");
      }
    });

    let productData = [];
    const user = socket.user;
    const phoneNumber = user.id.split(":")[0];
    const endpoint = `http://local.web-whisper-update.test/api/${phoneNumber}/products`;
    try {
      const response = await axios.get(endpoint);
      productData = response.data.products;
    } catch (error) {
      console.error(
        "Error fetching data from Laravel endpoint:",
        error.response
      );
    }

    cart = [];

    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      const chat = messages[0];
      const pesan =
        (
          chat.message?.extendedTextMessage?.text ??
          chat.message?.ephemeralMessage?.message?.extendedTextMessage?.text ??
          chat.message?.conversation
        )?.toLowerCase() || "";

      if (pesan === "!menu") {
        if (productData.length > 0) {
          const productNames = productData
            .map(
              (product) =>
                `${product.name} - Rp. ${
                  product.price
                }\n    \`\`\`!${product.name
                  .toLowerCase()
                  .replace(/\s/g, "")}\`\`\``
            )
            .join("\n\n");
          await socket.sendMessage(chat.key.remoteJid, {
            text: `Menu:\n${productNames}`,
          });
        } else {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Failed to fetch product data.",
          });
        }
      } else if (pesan === "!pesanlagi") {
        await socket.sendMessage(chat.key.remoteJid, {
          text: "Silakan pilih menu dan jumlah pesanan lagi.",
        });
      } else if (pesan === "!lanjutcheckout") {
        let orderDetails = "Pesanan Anda:\n";
        let totalCost = 0;
        for (const item of cart) {
          // Ubah loop untuk mencetak detail pesanan
          const product = productData.find((p) => p.id === item.product_id);
          if (product) {
            const subtotal = product.price * item.quantity;
            orderDetails += `${item.quantity} ${product.name} - Rp. ${subtotal}\n`;
            totalCost += subtotal;
          }
        }
        orderDetails += `Total Rp. ${totalCost}\n\nAnda yakin ingin memesan?\n\`\`\`    !yasayayakin\`\`\``;
        await socket.sendMessage(chat.key.remoteJid, {
          text: orderDetails,
        });
      } else if (pesan === "!yasayayakin") {
        await socket.sendMessage(chat.key.remoteJid, {
          text: `Jika anda yakin dengan pesanan anda maka ketikkan\n\`\`\` !!!nama!alamat\`\`\``,
        });
      } else if (pesan.startsWith("!pesan")) {
        const [, name, address] = pesan.split("@");
        const customerPhoneNumber = chat.key.remoteJid.split("@")[0];
        if (!name || !address) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Format pesanan salah. Silakan coba lagi.",
          });
          return;
        }
        if (cart.length === 0) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Mohon maaf, pesanan Anda belum ada karena keranjang belanja masih kosong.",
          });
          return;
        } else {
          const order = {
            name: name.trim(),
            phone_number: customerPhoneNumber,
            address: address.trim(),
            products: cart,
          };
          try {
            const response = await axios.post(
              "http://local.web-whisper-update.test/api/customer/transaction",
              order
            );
            await socket.sendMessage(chat.key.remoteJid, {
              text: "Pesanan berhasil diterima!",
            });
            cart = [];
          } catch (error) {
            await socket.sendMessage(chat.key.remoteJid, {
              text: `Gagal memesan. Silakan coba lagi nanti.${error.response.data}`,
            });
          }
        }
      } else {
        const orders = pesan.split(",");
        for (const orderText of orders) {
          const match = orderText.match(/^!(\w+)(?:\/(\d+))?$/);
          if (match) {
            const productName = match[1];
            const quantity = match[2] ? parseInt(match[2], 10) : 1;
            const product = productData.find(
              (product) =>
                product.name.toLowerCase().replace(/\s/g, "") === productName
            );

            if (product) {
              const existingItemIndex = cart.findIndex(
                (item) => item.product_id === product.id
              );
              if (existingItemIndex !== -1) {
                cart[existingItemIndex].quantity += quantity;
              } else {
                cart.push({ product_id: product.id, quantity: quantity });
              }

              let orderDetails = "Pesanan Anda:\n";
              let totalCost = 0;
              for (const item of cart) {
                const product = productData.find(
                  (p) => p.id === item.product_id
                );
                if (product) {
                  const subtotal = product.price * item.quantity;
                  orderDetails += `${item.quantity} ${product.name} - Rp. ${subtotal}\n`;
                  totalCost += subtotal;
                }
              }
              orderDetails += `Total Rp. ${totalCost}\n\nAnda ingin memesan menu lagi?\n\`\`\`    !pesanlagi\`\`\`\n\nAnda ingin lanjut checkout?\n\`\`\`    !lanjutcheckout\`\`\``;
              await socket.sendMessage(chat.key.remoteJid, {
                text: orderDetails,
              });
            } else {
              await socket.sendMessage(chat.key.remoteJid, {
                text: `Menu ${productName} tidak ditemukan.`,
              });
            }
          }
        }
      }
    });
  } catch (error) {
    console.error("Error starting WhatsApp bot:", error);
  }
}

startWhatsAppBot();
