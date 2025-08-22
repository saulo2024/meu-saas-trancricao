const express = require('express');
const router = express.Router();
const ytdl = require('ytdl-core');
const { AssemblyAI } = require('assemblyai');
const fs = require('fs-extra');
const path = require('path');

// Configurar AssemblyAI
const client = new AssemblyAI({
    apiKey: process.env.ASSEMBLYAI_API_KEY
});

// Função para validar URL do YouTube
function isValidYouTubeUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname === 'www.youtube.com' || 
               parsed.hostname === 'youtube.com' || 
               parsed.hostname === 'youtu.be';
    } catch {
        return false;
    }
}

// Função para obter informações do vídeo
async function getVideoInfo(url) {
    try {
        const info = await ytdl.getInfo(url);
        return {
            title: info.videoDetails.title,
            duration: formatDuration(parseInt(info.videoDetails.lengthSeconds)),
            channel: info.videoDetails.author.name,
            thumbnail: info.videoDetails.thumbnails[0]?.url,
            lengthSeconds: parseInt(info.videoDetails.lengthSeconds)
        };
    } catch (error) {
        console.error('Erro ao obter informações do vídeo:', error);
        return null;
    }
}

// Função para formatar duração
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// Função para baixar áudio do YouTube
async function downloadAudio(url, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            const audioStream = ytdl(url, {
                quality: 'highestaudio',
                filter: 'audioonly'
            });

            const writeStream = fs.createWriteStream(outputPath);
            
            audioStream.pipe(writeStream);
            
            writeStream.on('finish', () => {
                console.log('Download do áudio concluído');
                resolve(outputPath);
            });
            
            writeStream.on('error', (error) => {
                console.error('Erro ao salvar arquivo de áudio:', error);
                reject(error);
            });
            
            audioStream.on('error', (error) => {
                console.error('Erro no stream de áudio:', error);
                reject(error);
            });
            
        } catch (error) {
            reject(error);
        }
    });
}

// Função para transcrever com AssemblyAI
async function transcribeWithAssemblyAI(audioFilePath) {
    try {
        console.log('Iniciando upload e transcrição com AssemblyAI...');
        
        // Configurações da transcrição
        const params = {
            audio: audioFilePath,
            language_code: 'pt', // Português
            punctuate: true,
            format_text: true,
            speaker_labels: false, // Mude para true se quiser identificar diferentes falantes
            auto_chapters: false,
            sentiment_analysis: false,
            entity_detection: false
        };

        // Enviar arquivo para transcrição
        const transcript = await client.transcripts.transcribe(params);
        
        if (transcript.status === 'error') {
            throw new Error(`Erro na transcrição: ${transcript.error}`);
        }
        
        return {
            text: transcript.text,
            confidence: transcript.confidence,
            status: transcript.status,
            audio_duration: transcript.audio_duration
        };
        
    } catch (error) {
        console.error('Erro na transcrição AssemblyAI:', error);
        throw error;
    }
}

// Rota principal de transcrição
router.post('/transcribe', async (req, res) => {
    let tempAudioPath = null;
    
    try {
        const { url } = req.body;

        // Validações
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'URL do vídeo é obrigatória'
            });
        }

        if (!isValidYouTubeUrl(url)) {
            return res.status(400).json({
                success: false,
                message: 'URL do YouTube inválida'
            });
        }

        // Verificar se a chave da API está configurada
        if (!process.env.ASSEMBLYAI_API_KEY) {
            return res.status(500).json({
                success: false,
                message: 'Chave da API AssemblyAI não configurada'
            });
        }

        console.log('Obtendo informações do vídeo...');
        
        // Verificar se o vídeo existe e obter informações
        const videoInfo = await getVideoInfo(url);
        if (!videoInfo) {
            return res.status(400).json({
                success: false,
                message: 'Não foi possível acessar o vídeo. Verifique se a URL está correta e se o vídeo está público.'
            });
        }

        // Verificar duração (limitar para evitar custos excessivos)
        const maxDurationMinutes = parseInt(process.env.MAX_VIDEO_DURATION_MINUTES) || 30;
        const durationMinutes = Math.floor(videoInfo.lengthSeconds / 60);
        
        if (durationMinutes > maxDurationMinutes) {
            return res.status(400).json({
                success: false,
                message: `Vídeo muito longo (${durationMinutes}min). Máximo permitido: ${maxDurationMinutes} minutos.`
            });
        }

        console.log(`Vídeo aprovado: "${videoInfo.title}" (${videoInfo.duration})`);

        // Criar pasta temporária se não existir
        const tempDir = path.join(__dirname, '..', 'temp');
        await fs.ensureDir(tempDir);

        // Definir caminho do arquivo temporário
        const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1] || Date.now().toString();
        tempAudioPath = path.join(tempDir, `audio_${videoId}_${Date.now()}.webm`);

        console.log('Baixando áudio do vídeo...');
        
        // Baixar áudio do YouTube
        await downloadAudio(url, tempAudioPath);
        
        console.log('Transcrevendo áudio...');
        
        // Transcrever com AssemblyAI
        const transcriptionResult = await transcribeWithAssemblyAI(tempAudioPath);
        
        // Limpar arquivo temporário
        try {
            await fs.remove(tempAudioPath);
            tempAudioPath = null;
        } catch (cleanupError) {
            console.warn('Aviso: Não foi possível remover arquivo temporário:', cleanupError.message);
        }

        // Retornar resultado
        res.json({
            success: true,
            videoInfo: videoInfo,
            transcription: transcriptionResult.text,
            confidence: transcriptionResult.confidence,
            audio_duration: transcriptionResult.audio_duration,
            message: 'Transcrição concluída com sucesso!'
        });

    } catch (error) {
        console.error('Erro na transcrição:', error);
        
        // Limpar arquivo temporário em caso de erro
        if (tempAudioPath) {
            try {
                await fs.remove(tempAudioPath);
            } catch (cleanupError) {
                console.warn('Erro ao limpar arquivo temporário:', cleanupError.message);
            }
        }
        
        // Determinar mensagem de erro apropriada
        let errorMessage = 'Erro interno do servidor durante a transcrição';
        
        if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
            errorMessage = 'Erro de conexão. Verifique sua internet e tente novamente.';
        } else if (error.message.includes('Video unavailable')) {
            errorMessage = 'Vídeo indisponível ou privado.';
        } else if (error.message.includes('rate limit')) {
            errorMessage = 'Limite de requisições atingido. Tente novamente em alguns minutos.';
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage,
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Rota para teste da API
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'API de transcrição funcionando!',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        service: 'AssemblyAI'
    });
});

// Rota para verificar status
router.get('/status', (req, res) => {
    res.json({
        success: true,
        status: 'online',
        services: {
            youtube: 'disponível',
            assemblyai: process.env.ASSEMBLYAI_API_KEY ? 'configurado' : 'não configurado',
            temp_directory: 'disponível'
        },
        limits: {
            max_duration_minutes: parseInt(process.env.MAX_VIDEO_DURATION_MINUTES) || 30
        }
    });
});

// Rota para limpar arquivos temporários antigos (opcional)
router.post('/cleanup', async (req, res) => {
    try {
        const tempDir = path.join(__dirname, '..', 'temp');
        const files = await fs.readdir(tempDir).catch(() => []);
        
        let cleanedCount = 0;
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        for (const file of files) {
            const filePath = path.join(tempDir, file);
            const stats = await fs.stat(filePath).catch(() => null);
            
            if (stats && stats.mtime.getTime() < oneHourAgo) {
                await fs.remove(filePath);
                cleanedCount++;
            }
        }
        
        res.json({
            success: true,
            message: `${cleanedCount} arquivos temporários removidos`,
            cleaned_files: cleanedCount
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Erro ao limpar arquivos temporários',
            error: error.message
        });
    }
});

module.exports = router;