// https_server.js (Code đã chỉnh sửa)
import https from 'https';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_PORT = 3001; 

const options = {
  key: fs.readFileSync('key_unencrypted.pem'), 
  cert: fs.readFileSync('cert.pem')
};

const app = express();

// 1. Phục vụ các file tĩnh (CSS, JS, images,...)
// Express sẽ phục vụ tất cả file trong thư mục D:\Skemma
app.use(express.static(__dirname));

// 2. ✅ THÊM DÒNG NÀY: Xử lý yêu cầu truy cập đường dẫn gốc ("/")
// Khi truy cập https://192.168.100.42:3001, Server sẽ gửi file index.html
app.get('/', (req, res) => {
    // Đảm bảo file index.html nằm ngay trong thư mục D:\Skemma
    res.sendFile(path.join(__dirname, 'Chat.html'));
});

const server = https.createServer(options, app);

server.listen(FRONTEND_PORT, '0.0.0.0', () => {
  console.log(`✅ Front-end HTTPS Server: https://[IP của bạn]:${FRONTEND_PORT}`);
});