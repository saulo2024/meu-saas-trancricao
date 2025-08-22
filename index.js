require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');

const app = express();
const PORT = process.env.PORT || 3000;

// Criar pasta temp se não existir
const tempDir = path.join(__dirname, 'temp');
fs.ensureDir(tempDir).catch(console.error);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta public
app.use(express.static(path.join(__dirname, 'public')));

// Importar e usar as rotas da API
const transcribeRouter = require('./api/transcribe');
app.use('/api', transcribeRouter);

// Rota principal - servir o index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Limpeza automática de arquivos temporários a cada hora
setInterval(async () => {
    try {
        const files = await fs.readdir(tempDir).catch(() => []);
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        for (const file of files) {
            const filePath = path.join(tempDir, file);
            const stats = await fs.stat(filePath).catch(() => null);
            
            if (stats && stats.mtime.getTime() < oneHourAgo) {
                await fs.remove(filePath);
                console.log(`🗑️ Arquivo temporário removido: ${file}`);
            }
        }
    } catch (error) {
        console.error('Erro na limpeza automática:', error);
    }
}, 60 * 60 * 1000); // A cada hora

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
    console.error('Erro:', err);
    res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno'
    });
});

// Rota 404
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Rota não encontrada'
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📱 Acesse: http://localhost:${PORT}`);
    console.log(`🔑 AssemblyAI: ${process.env.ASSEMBLYAI_API_KEY ? '✅ Configurado' : '❌ Não configurado'}`);
});

module.exports = app;