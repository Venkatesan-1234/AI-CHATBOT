const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// Show startup information
console.log('\n🔧 Starting AI Chatbot Server...');
console.log(`📂 Current directory: ${process.cwd()}`);
console.log(`🔌 Port: ${PORT}`);
console.log(`📄 Environment file: ${process.env.NODE_ENV || 'development'}`);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files from public directory

// Initialize Google Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Rate limiting (simple in-memory implementation)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;

function rateLimit(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!rateLimitMap.has(clientIP)) {
        rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return next();
    }
    
    const clientData = rateLimitMap.get(clientIP);
    
    if (now > clientData.resetTime) {
        clientData.count = 1;
        clientData.resetTime = now + RATE_LIMIT_WINDOW;
        return next();
    }
    
    if (clientData.count >= MAX_REQUESTS_PER_WINDOW) {
        return res.status(429).json({ 
            error: 'Too many requests. Please try again later.' 
        });
    }
    
    clientData.count++;
    next();
}

// Input validation and sanitization
function validateMessage(message) {
    if (!message || typeof message !== 'string') {
        return { isValid: false, error: 'Message is required and must be a string' };
    }
    
    if (message.length > 1000) {
        return { isValid: false, error: 'Message too long. Please keep it under 1000 characters.' };
    }
    
    if (message.trim().length === 0) {
        return { isValid: false, error: 'Message cannot be empty' };
    }
    
    return { isValid: true };
}

// Chat endpoint
app.post('/api/chat', rateLimit, async (req, res) => {
    try {
        const { message } = req.body;
        
        // Validate input
        const validation = validateMessage(message);
        if (!validation.isValid) {
            return res.status(400).json({ error: validation.error });
        }
        
        // Check if API key is configured
        if (!process.env.GOOGLE_API_KEY) {
            return res.status(500).json({ 
                error: 'Server configuration error. Please contact administrator.' 
            });
        }
        
        // Generate response using Gemini
        const prompt = `You are a helpful, friendly, and knowledgeable AI assistant. Please respond to the following message in a conversational and helpful manner. Keep responses concise but informative.

User message: ${message}`;
        
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        
        if (!text) {
            throw new Error('Empty response from AI model');
        }
        
        res.json({ response: text });
        
    } catch (error) {
        console.error('Chat API Error:', error);
        
        // Handle specific error types
        if (error.message && error.message.includes('API_KEY_INVALID')) {
            return res.status(500).json({ 
                error: 'Invalid API key configuration' 
            });
        }
        
        if (error.message && error.message.includes('QUOTA_EXCEEDED')) {
            return res.status(503).json({ 
                error: 'Service temporarily unavailable due to quota limits' 
            });
        }
        
        res.status(500).json({ 
            error: 'Sorry, I encountered an error processing your request. Please try again.' 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Chatbot server running on http://localhost:${PORT}`);
    console.log(`📁 Frontend available at http://localhost:${PORT}`);
    console.log(`🔗 API endpoint at http://localhost:${PORT}/api/chat`);
    
    // Check if API key is configured
    if (!process.env.GOOGLE_API_KEY) {
        console.warn('⚠️  WARNING: GOOGLE_API_KEY environment variable is not set!');
    } else {
        console.log('✅ Google API key configured');
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\nSIGINT received. Shutting down gracefully...');
    process.exit(0);
});