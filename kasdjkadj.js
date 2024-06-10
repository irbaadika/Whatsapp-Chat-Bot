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
    //console.log(messages);

    if (type === "notify") {
      if (!messages[0].key.fromMe && !messages[0].key.participant) {
        //tentukan jenis pesan berbentuk text
        const pesan = messages[0].message.conversation;
        //tentukan jenis pesan apakah bentuk list
        const responseList = messages[0].message.listResponseMessage;
        //tentukan jenis pesan apakah bentuk button
        const responseButton = messages[0].message.buttonsResponseMessage;

        //tentukan jenis pesan apakah bentuk templateButtonReplyMessage
        const responseReplyButton =
          messages[0].message.templateButtonReplyMessage;

        //nowa dari pengirim pesan sebagai id
        const noWa = messages[0].key.remoteJid;

        await socket.readMessages([messages[0].key]);
        //kecilkan semua pesan yang masuk lowercase
        const pesanMasuk = pesan.toLowerCase();

        if (!messages[0].key.fromMe && pesanMasuk === "ping") {
          await socket.sendMessage(
            noWa,
            { text: "Pong" },
            { quoted: messages[0] }
          );
        } else if (!messages[0].key.fromMe && pesanMasuk === "btn") {
          const buttons = [
            {
              buttonId: "id1",
              buttonText: { displayText: "Info 1!" },
              type: 1,
            },
            {
              buttonId: "id2",
              buttonText: { displayText: "Info 2!" },
              type: 1,
            },
            {
              buttonId: "id3",
              buttonText: { displayText: "💵 Info 3" },
              type: 1,
            },
          ];
          const buttonInfo = {
            text: "Info Warung Kopi",
            buttons: buttons,
            headerType: 1,
            viewOnce: true,
          };
          await socket.sendMessage(noWa, buttonInfo, { quoted: messages[0] });
        } else if (!messages[0].key.fromMe && responseButton) {
          //console.log(responseButton);

          if (responseButton.selectedButtonId == "id1") {
            await socket.sendMessage(noWa, {
              text: "anda memilih ID tombol ke 1",
            });
          } else if (responseButton.selectedButtonId == "id2") {
            await socket.sendMessage(noWa, {
              text: "anda memilih ID tombol ke 2",
            });
          } else if (responseButton.selectedButtonId == "id3") {
            await socket.sendMessage(noWa, {
              text: "anda memilih ID tombol ke 3",
            });
          } else {
            await socket.sendMessage(noWa, {
              text: "Pesan tombol invalid",
            });
          }
        } else if (!messages[0].key.fromMe && pesanMasuk === "img") {
          const buttons = [
            {
              buttonId: "id1",
              buttonText: { displayText: "Info 1!" },
              type: 1,
            },
            {
              buttonId: "id2",
              buttonText: { displayText: "Info 2!" },
              type: 1,
            },
            {
              buttonId: "id3",
              buttonText: { displayText: "💵 Info 3" },
              type: 1,
            },
          ];
          await socket.sendMessage(noWa, {
            image: {
              url: "./image/KopiJahe.jpeg",
            },
            caption: "Ini Kopi Jahe",
            buttons: buttons,
            viewOnce: true,
          });
        } else if (!messages[0].key.fromMe && pesanMasuk === "sound") {
          textsound = capital("ini adalah pesan suara dari Robot Whastapp");

          let API_URL =
            "https://texttospeech.responsivevoice.org/v1/text:synthesize?text=" +
            textsound +
            "&lang=id&engine=g3&name=&pitch=0.5&rate=0.5&volume=1&key=kvfbSITh&gender=male";
          file = fs.createWriteStream("./sound.mp3");
          const request = https.get(API_URL, async function (response) {
            await response.pipe(file);
            response.on("end", async function () {
              await socket.sendMessage(noWa, {
                audio: {
                  url: "sound.mp3",
                  caption: textsound,
                },
                mimetype: "audio/mp4",
                viewOnce: true,
              });
            });
          });
        } else if (!messages[0].key.fromMe && pesanMasuk === "list") {
          const jenismenu = [
            {
              title: "MAKANAN",
              rows: [
                {
                  title: "Nasi Goreng",
                  rowId: "1",
                },
                {
                  title: "Mie Goreng",
                  rowId: "2",
                },
                {
                  title: "Bakso Goreng",
                  rowId: "3",
                },
              ],
            },
            {
              title: "MINUMAN",
              rows: [
                {
                  title: "Kopi Jahe",
                  rowId: "4",
                },
                {
                  title: "Kopi Susu",
                  rowId: "5",
                },
              ],
            },
          ];

          const listPesan = {
            text: "Menu Pada Warung Kami",
            title: "Daftar Menu",
            buttonText: "Tampilakn Menu",
            sections: jenismenu,
            viewOnce: true,
          };

          await socket.sendMessage(noWa, listPesan, { quoted: messages[0] });
        } else if (!messages[0].key.fromMe && responseList) {
          //cek row id yang dipilih
          const pilihanlist = responseList.singleSelectReply.selectedRowId;

          if (pilihanlist == 1) {
            await socket.sendMessage(noWa, {
              text: "Anda Memilih Item Makanan Nasi Goreng ",
            });
          } else if (pilihanlist == 2) {
            await socket.sendMessage(noWa, {
              text: "Anda Memilih Item Makanan Mie Goreng ",
            });
          } else if (pilihanlist == 3) {
            await socket.sendMessage(noWa, {
              text: "Anda Memilih Item Makanan Bakso Goreng ",
            });
          } else if (pilihanlist == 4) {
            await socket.sendMessage(noWa, {
              image: {
                url: "./image/KopiJahe.jpeg",
              },
              caption: "Anda Memilih Item Minuman Kopi Jahe",
              viewOnce: true,
            });
          } else if (pilihanlist == 5) {
            await socket.sendMessage(noWa, {
              image: {
                url: "./image/KopiSusu.jpeg",
              },
              caption: "Anda Memilih Item Minuman Kopi Susu",
              viewOnce: true,
            });
          } else {
            await socket.sendMessage(
              noWa,
              { text: "Pilihan Invalid!" },
              { quoted: messages[0] }
            );
          }
        } else if (!messages[0].key.fromMe && pesanMasuk === "pdf") {
          let file = "putusan_1233_pdt.g_2018_pa.gs_20230116125746.pdf";
          await socket.sendMessage(noWa, {
            document: { url: file },
            caption: "Pesan file",
            fileName: file,
            mimetype: file.mimetype,
          });
        } else if (
          !messages[0].key.fromMe &&
          !messages[0].key.participant &&
          pesanMasuk === "template"
        ) {
          const templateButtons = [
            {
              index: 0,
              urlButton: {
                displayText: "Lihat sample!",
                url: "https://youtube.com/@majacode",
              },
            },
            {
              index: 1,
              callButton: {
                displayText: "Hotline CS",
                phoneNumber: "+6281252053792",
              },
            },
            {
              index: 2,
              quickReplyButton: {
                displayText: "Oke Sudah jelas infonya min!",
                id: "id-button_trims",
              },
            },
            {
              index: 3,
              quickReplyButton: {
                displayText: "Kurang jelas!",
                id: "id-button_kurang_jelas",
              },
            },
            {
              index: 4,
              quickReplyButton: {
                displayText: "Siap, pesan 5000ton Wood Pellet!",
                id: "id-langsung-order",
              },
            },
          ];

          const templateMessage = {
            text: "Anda ingin segera order?",
            footer: "Hubungi kami segera! untuk mendapatkan diskon terbaik",
            templateButtons: templateButtons,
            viewOnce: true,
          };
          await socket.sendMessage(noWa, templateMessage, {
            quoted: messages[0],
          });
        } else if (
          !messages[0].key.fromMe &&
          !messages[0].key.participant &&
          responseReplyButton
        ) {
          console.log(responseReplyButton);
          if (responseReplyButton.selectedId == "id-button_trims") {
            await socket.sendMessage(noWa, {
              text: "*Terima kasih* sudah mengunjungi kami, \nSukses dan sehat selalu untuk *anda dan keluarga*.",
            });
          } else if (
            responseReplyButton.selectedId == "id-button_kurang_jelas"
          ) {
            await socket.sendMessage(noWa, {
              text: "*Bila informasi kurang jelas* silahkan mengunjungi website kami di, \nhttps://www.youtube.com/watch?v=xF0Z6Te2yO8",
            });
            console.log("Merasa kurang jelas");
          } else if (responseReplyButton.selectedId == "id-langsung-order") {
            await socket.sendMessage(noWa, {
              text: "Silahkan kunjungi form *pesanan order * di tautan berikut:, \nhttps://www.docs.google.com/forms/d/1Ht5W_qnCOJpaAQlMSJpw0I8kp840iWeDiRJDHlOqLdk/edit",
            });
            console.log("Alhamdulillah, Orangnya order hahha");
          }
        } else {
          await socket.sendMessage(
            noWa,
            { text: "Saya adalah Bot!" },
            { quoted: messages[0] }
          );
        }
      }
    }
  });
}
connectWhatsApp();
