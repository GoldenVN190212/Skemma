// https_server.js
import https from 'https';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ THAY THẾ BẰNG MẬT KHẨU CỦA BẠN!
const MY_PASS_PHRASE = 'Skemi_chat_2025'; 
const FRONTEND_PORT = 3001; 

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem'),
  passphrase: MY_PASS_PHRASE 
};

const app = express();
app.use(express.static(__dirname)); 

const server = https.createServer(options, app);

server.listen(FRONTEND_PORT, '0.0.0.0', () => {
  console.log(`✅ Front-end HTTPS Server: https://[IP của bạn]:${FRONTEND_PORT}`);
});