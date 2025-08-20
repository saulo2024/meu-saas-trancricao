/*
  Arquivo: /api/transcribe.js
  Este é o nosso backend. Coloque este arquivo dentro de uma pasta chamada "api" na raiz do seu projeto.
  A Vercel irá automaticamente transformá-lo em uma Serverless Function.
*/

// Importa as dependências que instalamos
const { AssemblyAI } = require('assemblyai');
const ytdl = require('ytdl-core');

// **ATENÇÃO**: Cole a sua chave da API da AssemblyAI aqui!
const client = new AssemblyAI({
  apiKey: "b0986337a8bf4f27bb30c9676f072776", 
});

// A função principal que será executada
module.exports = async (req, res) => {
  // O Vercel precisa disso para requisições do tipo OPTIONS (CORS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Verifica se o método da requisição é POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Pega a URL do corpo da requisição
  const { url } = req.body;

  if (!url || !ytdl.validateURL(url)) {
    return res.status(400).json({ error: 'URL do YouTube inválida ou não fornecida.' });
  }

  try {
    // Pega as informações do vídeo para obter a duração
    const videoInfo = await ytdl.getInfo(url);
    const durationInSeconds = parseInt(videoInfo.videoDetails.lengthSeconds);

    // Limite para o MVP: não processar vídeos muito longos para não gastar a cota gratuita
    if (durationInSeconds > 600) { // 10 minutos
        return res.status(400).json({ error: 'O vídeo é muito longo. O limite para esta demonstração é de 10 minutos.' });
    }

    // Pega o stream de áudio do vídeo usando ytdl-core
    const audioStream = ytdl(url, {
      filter: 'audioonly',
      quality: 'lowestaudio',
    });

    // Configura os parâmetros para a AssemblyAI
    const params = {
      audio: audioStream,
    };

    // Envia o áudio para a AssemblyAI e aguarda a transcrição
    const transcript = await client.transcripts.transcribe(params);

    if (transcript.status === 'error') {
      return res.status(500).json({ error: transcript.error });
    }

    // Retorna o texto da transcrição com sucesso
    res.status(200).json({ text: transcript.text });

  } catch (error) {
    console.error('Erro no processo de transcrição:', error);
    res.status(500).json({ error: 'Falha ao processar a transcrição. Verifique o link do vídeo.' });
  }
};
