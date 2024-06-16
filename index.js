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

    const carts = {};
    const paymentLock = {};

    socket.ev.on("messages.upsert", async ({ messages, type }) => {
      const chat = messages[0];
      const userId = chat.key.remoteJid;
      const pesan =
        (
          chat.message?.extendedTextMessage?.text ??
          chat.message?.ephemeralMessage?.message?.extendedTextMessage?.text ??
          chat.message?.conversation
        )?.toLowerCase() || "";

      if (!carts[userId]) {
        carts[userId] = [];
      }

      if (pesan === "!help") {
        await socket.sendMessage(chat.key.remoteJid, {
          text: "*TUTORIAL MENGGUNAKAN BOT*\n\n> Ketikkan ! di awal untuk menjalankan perintah sesuai dengan yang disediakan\n\nTampilkan Menu\n```    !menu```\n\nLacak Paket\n```    !track@kodetransaksi```",
        });
      } else if (pesan === "!cobalink") {
        await socket.sendMessage(
          chat.key.remoteJid,
          {
            text: "linknya adalah https://github.com/adiwajshing/baileys",
          },
          { disappearingMessagesInChat: 3 }
        );
      } else if (pesan.startsWith("!track")) {
        const [, transactionCode] = pesan.split("@");
        if (!transactionCode) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Format pesanan salah. Silakan coba lagi.",
          });
          return;
        }
        try {
          const response = await axios.get(
            `http://local.web-whisper-update.test/api/track/${transactionCode}`
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
              statusMessage = `> Sudah Diterima\n\nInformasi Penerima\nPenerima: ${customer.name}\nAlamat: ${customer.address}\npada ${updatedAt}`;
              break;
            default:
              break;
          }

          // Kirim pesan dengan order_status ke pengguna melalui WhatsApp (atau media lainnya)
          await socket.sendMessage(chat.key.remoteJid, {
            text: `Status pesanan untuk kode transaksi ${transactionCode.toUpperCase()}\n\n${statusMessage}`,
          });
        } catch (error) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Terjadi kesalahan saat melakukan pelacakan. Silakan coba lagi nanti.",
          });
        }
      } else if (pesan.startsWith("!rate")) {
        const [, transactionCode] = pesan.split("@");
        if (!transactionCode) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Format pesanan salah. Silakan coba lagi.",
          });
          return;
        }
        try {
          const response = await axios.get(
            `http://local.web-whisper-update.test/api/track/${transactionCode}`
          );
          const { order } = response.data;
          if (order.order_status !== "Fullfilled") {
            await socket.sendMessage(chat.key.remoteJid, {
              text: `Penilaian produk gagal, pesanan yang anda cari tidak ditemukan!`,
            });
          } else {
            const rateUrl = `http://local.web-whisper-update.test/rate/${transactionCode.toUpperCase()}`;
            await socket.sendMessage(chat.key.remoteJid, {
              text: `Silahkan klik tautan di bawah ini untuk melakukan penilaian pada produk yang anda pesan\n\n${rateUrl}`,
            });
          }
        } catch (error) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: "Terjadi kesalahan. Silakan coba lagi nanti.",
          });
        }
      } else if (pesan === "!menu") {
        try {
          const response = await axios.get(endpoint);
          productData = response.data.products;
        } catch (error) {
          console.error(
            "Error fetching data from Laravel endpoint:",
            error.response
          );
        }
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
            text: `\*MENU\*\n\n${productNames}\n\n\*Cara pesan\*\n> Pesan 1 menu :\n> \`\`\`    !bakso\`\`\`\n> Pesan 1 menu jumlah banyak :\n> \`\`\`    !bakso/2\`\`\`\n> Pesan beberapa menu :\n> \`\`\`    !bakso/2,!mie\`\`\``,
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
      } else if (pesan === "!checkout") {
        let orderDetails = "Pesanan Anda:\n";
        let totalCost = 0;
        for (const item of carts[userId]) {
          const product = productData.find((p) => p.id === item.product_id);
          if (product) {
            const subtotal = product.price * item.quantity;
            orderDetails += `${item.quantity} ${product.name} - Rp. ${subtotal}\n`;
            totalCost += subtotal;
          }
        }
        orderDetails += `Total Rp. ${totalCost}\n\nAnda yakin ingin memesan?\n\`\`\`    !yakin\`\`\``;
        await socket.sendMessage(chat.key.remoteJid, {
          text: orderDetails,
        });
      } else if (pesan === "!yakin") {
        await socket.sendMessage(chat.key.remoteJid, {
          text: `Jika anda yakin dengan pesanan anda maka ketikkan\n\`\`\` !pesan@nama@alamat\`\`\`\n\nContoh\n> !pesan@RijalAmmar@Jalan PDAM`,
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
              "http://local.web-whisper-update.test/api/customer/transaction",
              order
            );
            const transactionCode = response.data.result.code;
            // Mengirim pesan pertama
            await socket.sendMessage(chat.key.remoteJid, {
              text: `Pesanan Anda berhasil dibuat dengan kode:`,
            });

            // Mengirim pesan kedua
            await socket.sendMessage(chat.key.remoteJid, {
              text: `${transactionCode}`,
            });
            carts[userId] = []; // Clear the cart for this user

            paymentLock[transactionCode] = true;

            const payment = {
              transaction_id: transactionCode,
            };
            try {
              const response = await axios.post(
                "http://local.web-whisper-update.test/api/customer/transaction/payment",
                payment
              );
              const snapToken = response.data.payment_url;
              // Mengirim pesan ketiga
              await socket.sendMessage(
                chat.key.remoteJid,
                {
                  text: `Silahkan lakukan pembayaran dengan menekan tautan berikut ini:\n${snapToken}`,
                },
                { disappearingMessagesInChat: 5 }
              );
            } catch (error) {
              await socket.sendMessage(chat.key.remoteJid, {
                text: `Gagal mendapatkan kode pembayaran, silahkan lakukan kembali dengan mengetikkan\n\`\`\`!bayar@kodetransaksi\`\`\`\n> !bayar@TRX-2000000000`,
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
      } else if (pesan === "!kosongkancart") {
        carts[userId] = []; // Clear the cart for this user
        await socket.sendMessage(chat.key.remoteJid, {
          text: `Keranjang anda telah dikosongkan`,
        });
      } else if (pesan.startsWith("!bayar")) {
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

        // Set paymentLock to true to indicate this transaction is being processed
        paymentLock[transaction_id] = true;
        try {
          const payment = {
            transaction_id: transaction_id,
          };
          const response = await axios.post(
            "http://local.web-whisper-update.test/api/customer/transaction/payment",
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
      } else {
        const orders = pesan.split(",");
        let orderUpdated = false;

        for (const orderText of orders) {
          const match = orderText.match(/^!(\w+)(?:\/(\d+))?$/);
          if (match) {
            const productName = match[1];
            const quantity = match[2] ? parseInt(match[2], 10) : 1;
            if (quantity > 0) {
              const product = productData.find(
                (product) =>
                  product.name.toLowerCase().replace(/\s/g, "") === productName
              );

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
                  text: `Perintah ${productName} tidak ditemukan.`,
                });
                return;
              }
            }
          }
        }

        if (orderUpdated) {
          let orderDetails = "Pesanan Anda:\n";
          let totalCost = 0;
          for (const item of carts[userId]) {
            const product = productData.find((p) => p.id === item.product_id);
            if (product) {
              const subtotal = product.price * item.quantity;
              orderDetails += `${item.quantity} ${product.name} - Rp. ${subtotal}\n`;
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
