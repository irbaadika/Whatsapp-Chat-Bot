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
