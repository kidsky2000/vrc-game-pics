// 1. Move your imports to the absolute top of the file
const express = require('express');
const path = require('path'); // <-- Make sure this is initialized here!
const app = express();

// ... other requires like discord.js ...

// 2. Now this line will work perfectly because 'path' is ready to use
app.use('/processed_images', express.static(path.join(__dirname, 'processed_images')));
app.get('/images.txt', (req, res) => {
    res.sendFile(path.join(__dirname, 'images.txt'));
});

app.listen(4183, () => {
    console.log(`Web hosting server is running live on port 4183`);
});

const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const https = require('https');
const sharp = require('sharp'); 
const { exec } = require('child_process'); // Used to auto-upload to GitHub

// --- CONFIGURATION SETUP ---
const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = '1507979656693813329'; 
const REPO_DIR = path.join(__dirname); 
const BASE_WEB_URL = 'http://paid1.daki.cc:4183/processed_images/'; 
const MAX_IMAGES = 20; 
// ----------------------------

const OUTPUT_TXT = path.join(REPO_DIR, 'images.txt');
const IMAGE_DIR = path.join(REPO_DIR, 'processed_images');

if (!fs.existsSync(IMAGE_DIR)) {
    fs.mkdirSync(IMAGE_DIR);
}

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('clientReady', () => {
    console.log(`Bot initialized successfully. Scanning channel...`);
    processChannelImages();
});

client.on('messageCreate', (message) => {
    if (message.channel.id === CHANNEL_ID) {
        console.log("New message detected in target channel. Processing updates...");
        processChannelImages();
    }
});

async function processChannelImages() {
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        const messages = await channel.messages.fetch({ limit: 40 });
        let processedCount = 0;
        let urlList = [];
        let cleanLocalFiles = [];

        for (const [id, msg] of messages) {
            if (msg.attachments.size > 0) {
                for (const [attachId, attachment] of msg.attachments) {
                    if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                        
                        const localFilename = `pic_${processedCount}.jpg`;
                        const destinationPath = path.join(IMAGE_DIR, localFilename);

                        console.log(`Downscaling asset directly to 1080p: ${attachment.name}`);
                        await downloadAndResize(attachment.url, destinationPath);

                        urlList.push(`${BASE_WEB_URL}processed_images/${localFilename}`);
                        cleanLocalFiles.push(localFilename);
                        processedCount++;
                    }
                    if (processedCount >= MAX_IMAGES) break;
                }
            }
            if (processedCount >= MAX_IMAGES) break;
        }

        fs.writeFileSync(OUTPUT_TXT, urlList.join('\n'), 'utf8');
        console.log(`Updated local image cache list.`);
        
        // Fire git update protocol to push images live
        pushToGitHub();

    } catch (err) {
        console.error("Pipeline failure error encountered:", err);
    }
}

function downloadAndResize(url, dest) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            const resizer = sharp()
                .resize({ width: 1280, withoutEnlargement: true })
                .jpeg({ quality: 75 });

            const writeStream = fs.createWriteStream(dest);
            response.pipe(resizer).pipe(writeStream);
            writeStream.on('finish', () => resolve());
            writeStream.on('error', (err) => reject(err));
        }).on('error', (err) => reject(err));
    });
}

function pushToGitHub() {

    const GITHUB_USERNAME = 'kidsky2000';
    const GITHUB_REPO = 'vrc-game-pics';
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

    console.log("Uploading files to GitHub Pages...");

    const commands = `
    git config --global user.email "bot@vrchat.com"
    git config --global user.name "VRChatBot"

    git init

    git remote remove origin || true

    git remote add origin https://${GITHUB_USERNAME}:${GITHUB_TOKEN}@github.com/${GITHUB_USERNAME}/${GITHUB_REPO}.git

    git checkout -B main

    git add .

    git commit -m "Auto image update" || true

    git push origin main --force
    `;

    exec(commands, (err, stdout, stderr) => {

        if (err) {
            console.error("GitHub upload failed:");
            console.error(stderr);
            return;
        }

        console.log("GitHub sync successful!");
        console.log(stdout);
    });
}

client.login(TOKEN);