// TÊN FILE: server.js

const express = require('express');
const https = require('https'); 
const fs = require('fs');       
const { Server } = require('socket.io');

const PORT = 8000;

// ✅ CẤU HÌNH MỚI: Dùng khóa đã giải mã và BỎ DÒNG 'passphrase'
const options = {
    key: fs.readFileSync('key_unencrypted.pem'), 
    cert: fs.readFileSync('cert.pem')
};

const app = express();
const server = https.createServer(options, app); 

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ... (Giữ nguyên các biến Utils) ...
const userSockets = {};
const messageHistory = {}; 
function getConvId(uid1, uid2) {
    return [uid1, uid2].sort().join("_");
}

// --- Socket.IO Events ---

io.on('connection', (socket) => {
    // ... (Giữ nguyên toàn bộ logic kết nối, tin nhắn, WebRTC signaling,...) ...
    
    const userId = socket.handshake.auth.uid;
    
    if (!userId) {
        console.error("[ERROR] Connection refused: Missing UID in auth payload");
        socket.disconnect(true);
        return;
    }

    // 1. Xử lý kết nối và đăng ký Socket ID
    if (userSockets[userId]) {
        console.log(`[RECONNECT] Closing old socket for ${userId}: ${userSockets[userId]}`);
        const oldSocket = io.sockets.sockets.get(userSockets[userId]);
        if (oldSocket) {
            oldSocket.disconnect(true);
        }
    }
        
    userSockets[userId] = socket.id;
    console.log(`[CONNECT] User ${userId} connected with SID: ${socket.id}`);

    socket.emit('connected', { message: "Successfully connected to Node.js server" });

    // 2. Xử lý ngắt kết nối
    socket.on('disconnect', () => {
        let userIdToRemove = null;
        for (const [uid, sid] of Object.entries(userSockets)) {
            if (sid === socket.id) {
                userIdToRemove = uid;
                break;
            }
        }
        
        if (userIdToRemove) {
            delete userSockets[userIdToRemove];
            console.log(`[DISCONNECT] User ${userIdToRemove} disconnected`);
        }
    });

    // 3. Xử lý tin nhắn đến ('send_message')
    socket.on('send_message', (data) => {
        const senderId = data.sender;
        const receiverId = data.receiver;
        
        if (!senderId || !receiverId) return;

        const messageData = {
            key: Date.now().toString() + Math.random().toString(36).substring(2, 5),
            timestamp: Date.now(),
            seen: false,
            ...data
        };
        
        const convId = getConvId(senderId, receiverId);
        
        if (!messageHistory[convId]) {
            messageHistory[convId] = [];
        }
        messageHistory[convId].push(messageData);
        
        socket.emit('receive_message', messageData); 
        
        const receiverSid = userSockets[receiverId];
        if (receiverSid) {
            io.to(receiverSid).emit('receive_message', messageData);
        }
        
        console.log(`[MESSAGE] ${senderId} -> ${receiverId} in ${convId}`);
    });

    // 4. Yêu cầu lịch sử tin nhắn
    socket.on('request_history', (data) => {
        const senderId = data.sender;
        const receiverId = data.receiver;
        const convId = getConvId(senderId, receiverId);
        
        const history = messageHistory[convId] || [];
        
        socket.emit('message_history', { convId, messages: history });
        console.log(`[HISTORY] Sent ${history.length} messages to ${senderId} for ${convId}`);
    });

    // 5. Trạng thái gõ phím ('typing')
    socket.on('typing', (data) => {
        const receiverId = data.receiver;
        const receiverSid = userSockets[receiverId];
        
        if (receiverSid) {
            io.to(receiverSid).emit('typing', data);
        }
    });
    
    // 6. Xử lý yêu cầu gọi đi ('call_request')
    socket.on('call_request', (data) => {
        const { sender, receiver, callType } = data;
        const receiverSid = userSockets[receiver];
        
        console.log(`[CALL] ${sender} is requesting a ${callType} call to ${receiver}`);

        if (receiverSid) {
            // Người nhận đang online: Gửi incoming_call
            io.to(receiverSid).emit('incoming_call', {
                sender: sender,
                callType: callType,
                senderName: data.senderName
            });
            // Gửi ringing để client cập nhật UI chờ
            socket.emit('ringing', { sender, receiver }); 
        } else {
            // Người nhận offline: CHỜ 10 GIÂY TRƯỚC KHI BÁO LỖI
            console.log(`[CALL] Receiver ${receiver} is not reachable. Waiting 10s before notifying sender.`);
            
            setTimeout(() => {
                // SỬ DỤNG SỰ KIỆN 'not_reachable'
                socket.emit('not_reachable', { 
                    sender: sender,
                    receiver: receiver,
                    reason: 'Người nhận hiện không có mạng.' 
                });
                console.log(`[CALL] Sent 'not_reachable' to ${sender} after 10s delay.`);
            }, 10000); 
        }
    });

    // 7. Xử lý phản hồi từ người nhận ('call_response')
    socket.on('call_response', (data) => {
        const { receiver, sender, accepted, callType } = data;
        const senderSid = userSockets[sender];
        
        console.log(`[CALL] ${receiver} responded to call from ${sender}. Accepted: ${accepted}`);

        if (senderSid) {
            io.to(senderSid).emit('call_response', {
                receiver: receiver,
                accepted: accepted,
                callType: callType
            });
        }
    });

    // 8. Signaling WebRTC - Trao đổi ICE Candidates
    socket.on('webrtc_ice_candidate', (data) => {
        const { receiver, candidate } = data;
        const receiverSid = userSockets[receiver];
        
        if (receiverSid) {
            io.to(receiverSid).emit('webrtc_ice_candidate', {
                sender: data.sender,
                candidate: candidate
            });
        }
    });

    // 9. Signaling WebRTC - Trao đổi Session Description Protocol (SDP)
    socket.on('webrtc_sdp', (data) => {
        const { receiver, sdp } = data;
        const receiverSid = userSockets[receiver];
        
        if (receiverSid) {
            io.to(receiverSid).emit('webrtc_sdp', {
                sender: data.sender,
                sdp: sdp
            });
        }
    });

    // 10. Xử lý kết thúc cuộc gọi ('call_end')
    socket.on('call_end', (data) => {
        const { sender, receiver } = data;
        const receiverSid = userSockets[receiver];
        
        console.log(`[CALL] ${sender} ended call with ${receiver}`);

        if (receiverSid) {
            io.to(receiverSid).emit('call_ended', { sender: sender });
        }
    });
});

// Khởi chạy server Node.js
server.listen(PORT, () => {
    console.log(`Node.js Socket.IO Server running on HTTPS: https://localhost:${PORT}`); 
});