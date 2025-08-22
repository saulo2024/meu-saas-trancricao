/*
  Arquivo: /api/transcribe.js - VERSÃO 3 COM DEPURAÇÃO AVANÇADA
*/

// Importa as dependências que instalamos
const { AssemblyAI } = require('assemblyai');
const ytdl = require('ytdl-core');

// **ATENÇÃO**: Este código pega a chave da API das "Environment Variables" da Vercel.
// Certifique-se de que a variável ASSEMBLYAI_API_KEY foi criada corretamente no painel da Vercel.
const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY,
});

// A função principal que será executada
module.exports = async (req, res) => {
  console.log("[PASSO 1] A função /api/transcribe foi chamada.");

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    console.error("[ERRO] Método não permitido. Era " + req.method);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { url } = req.body;
  console.log("[PASSO 2] URL recebida do frontend:", url);

  if (!url || !ytdl.validateURL(url)) {
    console.error("[ERRO] URL do YouTube é inválida ou não foi fornecida.");
    return res.status(400).json({ error: 'URL do YouTube inválida ou não fornecida.' });
  }

  try {
    console.log("[PASSO 3] A extrair o áudio do vídeo com ytdl-core...");
    const audioStream = ytdl(url, {
      filter: 'audioonly',
      quality: 'lowestaudio',
    });
    console.log("[PASSO 4] Áudio extraído com sucesso. A enviar para a AssemblyAI...");

    const params = { audio: audioStream };
    const transcript = await client.transcripts.transcribe(params);
    console.log("[PASSO 5] Resposta recebida da AssemblyAI. Status:", transcript.status);

    if (transcript.status === 'error') {
      console.error("[ERRO DA API] A AssemblyAI devolveu um erro:", transcript.error);
      return res.status(500).json({ error: transcript.error });
    }

    console.log("[SUCESSO] Transcrição concluída. A enviar texto de volta.");
    res.status(200).json({ text: transcript.text });

  } catch (error) {
    console.error('[ERRO GERAL] Ocorreu uma falha grave no bloco try/catch:', error);
    res.status(500).json({ error: 'Falha crítica ao processar a transcrição.' });
  }
};
